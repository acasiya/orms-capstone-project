import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from orms_backend.emails import send_password_reset_email

from .models import AuditLog, LoginSession, PasswordResetCode, VoterVerification, log_action

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """
    Public self-registration. Always creates a `citizen` role account —
    Staff and Admin accounts are created separately by an Administrator
    (see AdminCreateUserSerializer), never through open signup. Also
    requires a voter's ID photo, which creates a pending VoterVerification
    row for an Administrator to review (see AdminApproveVerificationView) —
    the account can't log in until then, see CustomTokenObtainPairSerializer.
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])
    voter_id_image = serializers.ImageField(write_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "contact_number", "address", "voter_id_image",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        voter_id_image = validated_data.pop("voter_id_image")
        password = validated_data.pop("password")
        # username isn't used for login, but Django's User model requires one;
        # derive it from email so it stays unique without asking the resident for it.
        validated_data["username"] = validated_data["email"]
        validated_data["role"] = User.Role.CITIZEN
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        VoterVerification.objects.create(user=user, voter_id_image=voter_id_image)
        return user


class AdminCreateUserSerializer(serializers.ModelSerializer):
    """
    Used by Administrators to create any account directly — Citizen, Staff,
    or Admin — pre-verified (no voter's ID review needed, since an admin is
    vetting/entering it directly rather than the person self-registering).
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "contact_number", "address", "role", "position",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["username"] = validated_data["email"]
        validated_data["is_verified"] = True
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    """
    Read-only profile info — used by GET /api/auth/me/, and embedded in the
    login response so the navbar/topbar avatar has it immediately without a
    second request.
    """

    name = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "name", "first_name", "last_name",
            "role", "position", "contact_number", "address", "is_verified",
            "profile_picture",
        ]

    def get_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_profile_picture(self, obj):
        if not obj.profile_picture:
            return None
        request = self.context.get("request")
        url = obj.profile_picture.url
        return request.build_absolute_uri(url) if request else url


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Self-service editing for PATCH /api/auth/me/ (My Profile → Edit
    Information, all three portals). Deliberately excludes role/is_verified/
    position — those are admin-controlled elsewhere (Manage Accounts) — so a
    user can't escalate their own privileges through their own profile form.
    """

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "contact_number", "address", "profile_picture"]


class AdminAccountSerializer(serializers.ModelSerializer):
    """
    Shapes a User into exactly the fields the admin Manage Accounts page
    (frontend/admin/js/manage-accounts.js) already expects — owner/type/
    active/lastActiveLabel/etc — so that page's existing render/sort/filter
    logic works unchanged once it fetches from the API instead of the
    hardcoded ACCOUNTS array.
    """

    owner = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    # Whether the account can log in at all — what the Manage Accounts
    # Disable/Enable button actually controls. (Previously this field was
    # computed from last_login recency instead, which meant Disable never
    # visibly did anything: it flipped is_active correctly on the backend,
    # but the UI kept showing "Active" as long as the account had logged in
    # recently, regardless of is_active.)
    active = serializers.BooleanField(source="is_active", read_only=True)
    lastActiveLabel = serializers.SerializerMethodField()
    activityMinutes = serializers.SerializerMethodField()
    created = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="date_joined", read_only=True)
    updated = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "owner", "email", "type", "active",
            "lastActiveLabel", "activityMinutes", "created", "createdAt", "updated",
        ]

    def get_owner(self, obj):
        return obj.get_full_name() or obj.username

    def get_type(self, obj):
        if obj.role == User.Role.ADMIN:
            return "Administrator"
        if obj.role == User.Role.CITIZEN:
            return "Barangay Citizen"
        return obj.position or "Barangay Staff"

    def _minutes_since(self, moment):
        from django.utils import timezone
        if not moment:
            return None
        delta = timezone.now() - moment
        return max(int(delta.total_seconds() // 60), 0)

    def get_activityMinutes(self, obj):
        minutes = self._minutes_since(obj.last_login)
        # Never-logged-in accounts sort to the end of "Most Recently Active"
        # rather than floating to the top as if they were just active.
        return minutes if minutes is not None else 10**9

    def get_lastActiveLabel(self, obj):
        from django.utils.timesince import timesince
        if not obj.last_login:
            return "Never logged in"
        return f"{timesince(obj.last_login)} ago"

    def get_created(self, obj):
        from django.utils.timesince import timesince
        return f"{timesince(obj.date_joined)} ago"

    def get_updated(self, obj):
        from django.utils.timesince import timesince
        return f"{timesince(obj.updated_at)} ago"


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends SimpleJWT's login serializer so the token payload — and the
    login response body — includes role/name. This lets the frontend route
    the user to the right portal page and greet them by name without a
    second request right after login.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["name"] = user.get_full_name() or user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        # Citizens start unverified until an Administrator approves their
        # voter's ID (see AdminApproveVerificationView). Staff/Admin accounts
        # are created pre-verified, so this only ever blocks citizens.
        if not self.user.is_verified:
            raise AuthenticationFailed(
                "Your account is still under verification. Please try again later.",
                code="account_unverified",
            )

        # LoginSession tracks the open/closed session itself (see LogoutView);
        # log_action is the separate "Logged in" row shown on View Audit Logs.
        LoginSession.objects.create(user=self.user)
        log_action(self.user, "Logged in")

        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class PasswordResetRequestSerializer(serializers.Serializer):
    """Forgot Password step 1 — emails a fresh 6-digit code to the account."""

    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            self._user = User.objects.get(email__iexact=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found with that email.")
        return value

    def save(self):
        # Invalidate any earlier unused codes so only the one just emailed works.
        PasswordResetCode.objects.filter(user=self._user, used_at__isnull=True).update(
            used_at=timezone.now()
        )
        code = f"{random.randint(0, 999999):06d}"
        PasswordResetCode.objects.create(
            user=self._user,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=PasswordResetCode.CODE_TTL_MINUTES),
        )
        send_password_reset_email(self._user, code, PasswordResetCode.CODE_TTL_MINUTES)


class PasswordResetVerifySerializer(serializers.Serializer):
    """Forgot Password step 2 — Input Code checks the code before step 3."""

    email = serializers.EmailField()
    code = serializers.CharField()

    def validate(self, attrs):
        reset_code = (
            PasswordResetCode.objects.filter(
                user__email__iexact=attrs["email"], code=attrs["code"], used_at__isnull=True
            )
            .order_by("-created_at")
            .first()
        )
        if not reset_code or not reset_code.is_valid():
            raise serializers.ValidationError("Invalid or expired code.")
        attrs["reset_code"] = reset_code
        return attrs

    def save(self):
        reset_code = self.validated_data["reset_code"]
        reset_code.verified_at = timezone.now()
        reset_code.save(update_fields=["verified_at"])


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Forgot Password step 3 — Reset Password actually sets the new password."""

    email = serializers.EmailField()
    code = serializers.CharField()
    password = serializers.CharField(validators=[validate_password])

    def validate(self, attrs):
        reset_code = (
            PasswordResetCode.objects.filter(
                user__email__iexact=attrs["email"],
                code=attrs["code"],
                used_at__isnull=True,
                verified_at__isnull=False,
            )
            .order_by("-created_at")
            .first()
        )
        if not reset_code or not reset_code.is_valid():
            raise serializers.ValidationError("Invalid or expired code.")
        attrs["reset_code"] = reset_code
        return attrs

    def save(self):
        reset_code = self.validated_data["reset_code"]
        user = reset_code.user
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password"])
        reset_code.used_at = timezone.now()
        reset_code.save(update_fields=["used_at"])


class PendingVerificationSerializer(serializers.ModelSerializer):
    """
    Shapes a VoterVerification into what the admin Approve Accounts page
    (frontend/admin/js/approve-accounts.js) expects — owner/email/type/
    photoUrl/created — mirroring how AdminAccountSerializer shapes accounts
    for the Manage Accounts page.
    """

    owner = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    type = serializers.SerializerMethodField()
    photoUrl = serializers.SerializerMethodField()
    created = serializers.SerializerMethodField()

    class Meta:
        model = VoterVerification
        fields = ["id", "owner", "email", "type", "photoUrl", "created"]

    def get_owner(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_type(self, obj):
        if obj.user.role == User.Role.ADMIN:
            return "Administrator"
        if obj.user.role == User.Role.CITIZEN:
            return "Barangay Citizen"
        return obj.user.position or "Barangay Staff"

    def get_photoUrl(self, obj):
        request = self.context.get("request")
        url = obj.voter_id_image.url
        return request.build_absolute_uri(url) if request else url

    def get_created(self, obj):
        from django.utils.timesince import timesince
        return f"{timesince(obj.created_at)} ago"


class AuditLogSerializer(serializers.ModelSerializer):
    """Shapes an AuditLog row for the admin View Audit Logs page."""

    accountId = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    timeAt = serializers.DateTimeField(source="created_at", read_only=True)
    timeLabel = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ["id", "accountId", "owner", "type", "timeAt", "timeLabel", "action"]

    def get_accountId(self, obj):
        return str(obj.user_id) if obj.user_id else "—"

    def get_owner(self, obj):
        if not obj.user:
            return "Deleted account"
        return obj.user.get_full_name() or obj.user.username

    def get_type(self, obj):
        if not obj.user:
            return "—"
        if obj.user.role == User.Role.ADMIN:
            return "Administrator"
        if obj.user.role == User.Role.CITIZEN:
            return "Barangay Citizen"
        return obj.user.position or "Barangay Staff"

    def get_timeLabel(self, obj):
        from django.utils import timezone
        return timezone.localtime(obj.created_at).strftime("%H:%M:%S %m/%d/%Y")
