from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from orms_backend.emails import (
    send_account_approved_email,
    send_account_created_admin_emails,
    send_account_rejected_email,
)

from .models import LoginSession, User, VoterVerification
from .serializers import (
    AdminAccountSerializer,
    AdminCreateUserSerializer,
    AuditLogSerializer,
    CustomTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    PendingVerificationSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — public citizen signup."""
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        admins = User.objects.filter(role=User.Role.ADMIN, is_active=True)
        send_account_created_admin_emails(user, admins)


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/request/ — Forgot Password: emails a 6-digit code."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "A reset code has been sent to your email."})


class PasswordResetVerifyView(APIView):
    """POST /api/auth/password-reset/verify/ — Input Code: checks the code is valid."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Code verified."})


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/ — Reset Password: sets the new password."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Your password has been reset."})


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — returns access + refresh JWT tokens plus user info."""
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """
    POST /api/auth/logout/ — closes out the caller's most recent open
    LoginSession (see CustomTokenObtainPairSerializer), so View Audit Logs
    shows when they actually logged out instead of leaving it blank.
    Doesn't invalidate the JWT itself (no token blacklist app installed) —
    the frontend still just discards the tokens client-side.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session = (
            LoginSession.objects.filter(user=request.user, logged_out_at__isnull=True)
            .order_by("-logged_in_at")
            .first()
        )
        if session:
            from django.utils import timezone
            session.logged_out_at = timezone.now()
            session.save(update_fields=["logged_out_at"])
        return Response({"detail": "Logged out."})


class MeView(APIView):
    """
    GET /api/auth/me/ — the logged-in user's own profile (requires Bearer token).
    PATCH /api/auth/me/ — edits it (My Profile → Edit Information, all three
    portals) — name/email/contact/address/profile picture only, see
    ProfileUpdateSerializer for why role/position/is_verified aren't here.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)


class IsStaffOrAdmin(permissions.BasePermission):
    """
    For endpoints Barangay Officials also need access to (e.g. reviewing
    reports, once that module exists) — Administrators pass this check too,
    since they can do everything Staff can plus account management.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (User.Role.STAFF, User.Role.ADMIN)
        )


class AdminCreateUserView(generics.CreateAPIView):
    """
    POST /api/auth/admin/create-user/ — Administrator-only endpoint for
    creating any account type directly, pre-verified (Administrator Module:
    account creation).
    """
    queryset = User.objects.all()
    serializer_class = AdminCreateUserSerializer
    permission_classes = [IsAdmin]


class AdminListUsersView(generics.ListAPIView):
    """
    GET /api/auth/admin/users/ — Administrator Module: Manage Accounts list.
    Shaped to match frontend/admin/js/manage-accounts.js's expected fields
    directly (see AdminAccountSerializer), so that page's existing render/
    sort/filter code works unchanged once wired to this endpoint.
    """
    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = AdminAccountSerializer
    permission_classes = [IsAdmin]


class AdminAccountDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/auth/admin/users/<id>/ — backs the Manage Accounts
    "Edit Account" modal: viewing details, toggling active/disabled,
    changing account type (role/position), and deleting the account all go
    through here.
    """
    queryset = User.objects.all()
    serializer_class = AdminAccountSerializer
    permission_classes = [IsAdmin]

    def patch(self, request, *args, **kwargs):
        user = self.get_object()
        is_self = user.id == request.user.id

        # Prevent an admin from disabling their own account — a simple
        # mis-click here would otherwise lock them out instantly (is_active
        # is checked on every request, not just at login) with no one else
        # necessarily around to undo it.
        if "active" in request.data:
            new_active = bool(request.data["active"])
            if is_self and not new_active:
                return Response(
                    {"detail": "You can't disable your own account."},
                    status=400,
                )
            user.is_active = new_active

        # Update User Type only ever offers Citizen/Administrator/Barangay
        # Staff (see manage-accounts.html's updateTypeSelect), so any other
        # value reaching here is either a bug or a bypassed frontend — reject
        # it rather than writing an unrecognized role to the database.
        if "role" in request.data and request.data["role"] not in User.Role.values:
            return Response({"detail": "Invalid account type."}, status=400)

        # Prevent removing Admin permissions from the last remaining admin
        # account, or from yourself — either would leave the system with no
        # one able to manage accounts at all.
        if "role" in request.data and request.data["role"] != User.Role.ADMIN:
            if is_self:
                return Response(
                    {"detail": "You can't change your own account type."},
                    status=400,
                )
            if user.role == User.Role.ADMIN and User.objects.filter(role=User.Role.ADMIN).count() <= 1:
                return Response(
                    {"detail": "Can't remove the last remaining Administrator."},
                    status=400,
                )
            user.role = request.data["role"]
        elif "role" in request.data:
            user.role = request.data["role"]

        if "position" in request.data:
            user.position = request.data["position"]

        user.save()
        return Response(AdminAccountSerializer(user).data)

    def delete(self, request, *args, **kwargs):
        user = self.get_object()

        if user.id == request.user.id:
            return Response({"detail": "You can't delete your own account."}, status=400)

        if user.role == User.Role.ADMIN and User.objects.filter(role=User.Role.ADMIN).count() <= 1:
            return Response({"detail": "Can't remove the last remaining Administrator."}, status=400)

        user.delete()
        return Response(status=204)


class AdminListPendingVerificationsView(generics.ListAPIView):
    """
    GET /api/auth/admin/verifications/ — Administrator Module: Approve
    Accounts list. Only accounts still awaiting review show up here;
    approved/rejected ones drop off (rejection deletes the account, see
    AdminRejectVerificationView).
    """
    queryset = (
        VoterVerification.objects.filter(status=VoterVerification.Status.PENDING)
        .select_related("user")
        .order_by("created_at")
    )
    serializer_class = PendingVerificationSerializer
    permission_classes = [IsAdmin]

    def get_serializer_context(self):
        # photoUrl needs the request to build an absolute URL for local
        # (non-Cloudinary) dev, where FileField.url is just "/media/...".
        return {"request": self.request}


class AdminApproveVerificationView(APIView):
    """POST /api/auth/admin/verifications/<id>/approve/ — marks the account verified."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        verification = get_object_or_404(
            VoterVerification, pk=pk, status=VoterVerification.Status.PENDING
        )
        verification.status = VoterVerification.Status.APPROVED
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        verification.save()
        verification.user.is_verified = True
        verification.user.save(update_fields=["is_verified"])
        send_account_approved_email(verification.user)
        return Response({"detail": "Account approved."})


class AdminRejectVerificationView(APIView):
    """
    POST /api/auth/admin/verifications/<id>/reject/ — requires a `reason`
    (what was wrong, e.g. an unreadable ID photo), emails it to the
    applicant, then deletes the pending account outright. Deleting (rather
    than keeping a permanently-rejected row around) is what gives them
    "another chance" — it frees up their email/username so they can just
    sign up again once they've fixed whatever was wrong.
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        verification = get_object_or_404(
            VoterVerification, pk=pk, status=VoterVerification.Status.PENDING
        )
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response(
                {"detail": "Please provide a reason for rejecting this account."}, status=400
            )
        user = verification.user
        send_account_rejected_email(user.get_full_name() or user.username, user.email, reason)
        user.delete()
        return Response({"detail": "Account rejected."})


class AdminListAuditLogsView(generics.ListAPIView):
    """GET /api/auth/admin/audit-logs/ — Administrator Module: View Audit Logs."""
    queryset = LoginSession.objects.select_related("user").order_by("-logged_in_at")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]


class AdminResetPasswordView(APIView):
    """
    POST /api/auth/admin/users/<id>/reset-password/ — backs the "Reset
    Password" button. Generates a one-time reset token; actually emailing it
    is a follow-up (no email service wired up yet), so this currently
    returns the token directly for testing.
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        token = default_token_generator.make_token(user)
        return Response({
            "detail": f"Password reset token generated for {user.email}.",
            "token": token,
        })
