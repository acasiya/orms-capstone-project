import uuid

from django.conf import settings
from django.db import models


def pdf_storage():
    """
    Cloudinary's default "image" resource type (what MediaCloudinaryStorage
    uses) blocks unauthenticated delivery of PDFs as a security default —
    downloading one 401s unless the account owner opts in via the
    Cloudinary dashboard. Uploading as resource_type "raw" instead sidesteps
    that restriction entirely (raw files don't support the on-the-fly
    transformations the restriction guards against), so PDFs need their own
    storage class distinct from images/avatars/evidence photos. Falls back
    to local disk the same way STORAGES["default"] does when Cloudinary
    isn't configured.
    """
    if settings.STORAGES["default"]["BACKEND"] == "cloudinary_storage.storage.MediaCloudinaryStorage":
        from cloudinary_storage.storage import RawMediaCloudinaryStorage

        return RawMediaCloudinaryStorage()
    from django.core.files.storage import FileSystemStorage

    return FileSystemStorage()


class Ordinance(models.Model):
    """
    A real barangay ordinance, uploaded by Staff/Admin as a PDF. Replaces the
    old hardcoded frontend placeholder list (frontend/*/js/ordinances-data.js).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    date_approved = models.DateField()
    description = models.TextField()
    pdf_file = models.FileField(upload_to="ordinances/%Y/%m/", storage=pdf_storage)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="uploaded_ordinances"
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_approved"]

    def __str__(self):
        return f"{self.number} — {self.title}"
