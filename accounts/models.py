import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Single user table for all three portals (Citizen, Staff/Barangay Official,
    Administrator). `role` determines which portal's views/permissions apply.
    Login is by email instead of Django's default username.
    """

    class Role(models.TextChoices):
        CITIZEN = "citizen", "Barangay Citizen"
        STAFF = "staff", "Barangay Official"
        ADMIN = "admin", "Administrator"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CITIZEN)
    contact_number = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)

    # Free-text job title for Staff accounts only (e.g. "Secretary",
    # "Investigator", "Barangay Captain") — separate from `role`, which is
    # what actually controls permissions. Purely for display on the admin
    # accounts list; left blank for citizen/admin accounts.
    position = models.CharField(max_length=50, blank=True)

    profile_picture = models.ImageField(upload_to="avatars/%Y/%m/", null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    # Residents start unverified until an admin approves their voter's ID.
    # Staff/Admin accounts are created directly by an admin, so default True.
    is_verified = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class VoterVerification(models.Model):
    """Tracks a resident's voter's ID review, per the Administrator Module scope."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="verification")
    voter_id_image = models.ImageField(upload_to="verification/%Y/%m/")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_verifications"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Verification for {self.user} — {self.status}"


class LoginSession(models.Model):
    """
    One row per login, backing the Administrator Module's View Audit Logs
    page. Created on successful login (CustomTokenObtainPairSerializer);
    logged_out_at is filled in by LogoutView when the user explicitly logs
    out, and stays null if they never did (session just expired/closed).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_sessions")
    logged_in_at = models.DateTimeField(auto_now_add=True)
    logged_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-logged_in_at"]

    def __str__(self):
        return f"{self.user} @ {self.logged_in_at}"
