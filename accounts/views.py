from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, VoterVerification
from .serializers import (
    AdminAccountSerializer,
    AdminCreateUserSerializer,
    CustomTokenObtainPairSerializer,
    PendingVerificationSerializer,
    RegisterSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — public citizen signup."""
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — returns access + refresh JWT tokens plus user info."""
    serializer_class = CustomTokenObtainPairSerializer


class MeView(APIView):
    """GET /api/auth/me/ — the logged-in user's own profile (requires Bearer token)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


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
    creating Staff or Admin accounts (Administrator Module: account creation).
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


class AdminAccountDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/auth/admin/users/<id>/ — backs the Manage Accounts "Edit
    Account" modal: viewing details, toggling active/disabled, and changing
    account type (role/position) all go through PATCH here.
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
        return Response({"detail": "Account approved."})


class AdminRejectVerificationView(APIView):
    """
    POST /api/auth/admin/verifications/<id>/reject/ — deletes the pending
    account outright. There's no email service wired up yet to notify a
    rejected applicant (e.g. to explain what was wrong with their ID and
    let them resubmit under the same account), so leaving a permanently
    unverified account around would just be a dead end that always shows
    "under verification" at login with no way forward. Deleting frees up
    their email/username so they can sign up again instead.
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        verification = get_object_or_404(
            VoterVerification, pk=pk, status=VoterVerification.Status.PENDING
        )
        verification.user.delete()
        return Response({"detail": "Account rejected."})


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
