from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import LoginSession, VoterVerification

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
    """Read-only profile info — used by the /api/auth/me/ endpoint."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "name", "first_name", "last_name",
            "role", "contact_number", "address", "is_verified",
        ]

    def get_name(self, obj):
        return obj.get_full_name() or obj.username


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

        # Backs the Administrator Module's View Audit Logs page — one row
        # per login, closed out by LogoutView when they explicitly log out.
        LoginSession.objects.create(user=self.user)

        data["user"] = UserSerializer(self.user).data
        return data


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
    """Shapes a LoginSession for the admin View Audit Logs page."""

    owner = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    loggedOnAt = serializers.DateTimeField(source="logged_in_at", read_only=True)
    loggedOnLabel = serializers.SerializerMethodField()
    loggedOffAt = serializers.DateTimeField(source="logged_out_at", read_only=True)
    loggedOffLabel = serializers.SerializerMethodField()

    class Meta:
        model = LoginSession
        fields = ["id", "owner", "type", "loggedOnAt", "loggedOnLabel", "loggedOffAt", "loggedOffLabel"]

    def get_owner(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_type(self, obj):
        if obj.user.role == User.Role.ADMIN:
            return "Administrator"
        if obj.user.role == User.Role.CITIZEN:
            return "Barangay Citizen"
        return obj.user.position or "Barangay Staff"

    def _format(self, moment):
        from django.utils import timezone
        return timezone.localtime(moment).strftime("%H:%M:%S %m/%d/%Y")

    def get_loggedOnLabel(self, obj):
        return self._format(obj.logged_in_at)

    def get_loggedOffLabel(self, obj):
        return self._format(obj.logged_out_at) if obj.logged_out_at else "Still logged in"
