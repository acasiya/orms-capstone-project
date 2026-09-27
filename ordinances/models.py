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


class OrdinanceQuerySet(models.QuerySet):
    """
    Named shortcuts for the ordinance/resolution split, so code that must only
    ever see one kind says so plainly instead of repeating a kind filter
    (easy to forget — e.g. File Report must never offer a resolution):

        Ordinance.objects.ordinances().published()   # citizen-visible ordinances
        Ordinance.objects.resolutions()
        Ordinance.objects.of_kind(request.query_params.get("kind"))
    """

    def ordinances(self):
        return self.filter(kind=Ordinance.Kind.ORDINANCE)

    def resolutions(self):
        return self.filter(kind=Ordinance.Kind.RESOLUTION)

    def of_kind(self, kind):
        """Filter to one kind; an empty/unknown value leaves both kinds in."""
        return self.filter(kind=kind) if kind in Ordinance.Kind.values else self

    def published(self):
        """Not archived — what citizens and guests are allowed to see."""
        return self.filter(is_archived=False)


class Ordinance(models.Model):
    """
    A real barangay ordinance or resolution, uploaded by Staff/Admin as a PDF.
    Replaces the old hardcoded frontend placeholder list
    (frontend/*/js/ordinances-data.js).

    Resolutions share this model (same fields, same lists and detail pages,
    filterable by `kind`) rather than getting their own, since they're
    displayed and searched alongside ordinances. Who may manage each kind
    differs: the Secretary handles ordinances, the Barangay Treasurer
    resolutions (see accounts.views.managed_document_kinds). Only ordinances
    can be violated, so File Report's dropdown and suggestions use
    kind=ORDINANCE only.
    """

    class Kind(models.TextChoices):
        ORDINANCE = "ordinance", "Ordinance"
        RESOLUTION = "resolution", "Resolution"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.ORDINANCE, db_index=True)
    number = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    # Free text, typed directly on Upload/Edit Ordinance — not a ForeignKey to
    # OrdinanceAuthor. The roster (see that model) only powers autocomplete
    # suggestions there; ordinances from outside the barangay/city council, a
    # multi-name "Co-authors: ..." credit, or simply a typo-proofed manual
    # entry all still need to fit here, so nothing forces this to match a
    # roster entry.
    author = models.CharField(max_length=255)
    # Also free text rather than a ForeignKey, for the same "don't force every
    # value through a fixed relation" reason — but see OrdinanceCreateSerializer/
    # OrdinanceUpdateSerializer's validate_category, which does require this to
    # match a currently-active OrdinanceCategory.name (unlike author, Category
    # is meant to be a closed, consistent list — see that model's docstring).
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

    objects = OrdinanceQuerySet.as_manager()

    class Meta:
        ordering = ["-date_approved"]

    def __str__(self):
        return f"{self.number} — {self.title}"


class OrdinanceAuthor(models.Model):
    """
    The roster behind Upload/Edit Ordinance's Author autocomplete suggestions
    (Ordinance.author itself stays free text — see that field) — an
    Administrator maintains this (see accounts.views.IsAdmin) because who
    holds these seats changes with every barangay election, not with any
    single ordinance. Since ordinances aren't required to match an entry here
    (an ordinance from outside the barangay council wouldn't — this repository
    also holds City Ordinances, see ordinances/samples/), this is a
    convenience for the common case, not a validated picklist.

    Scoped to the Sangguniang Barangay only (not city/municipal-level seats —
    kept simple since Barangay Platero's own ordinances are what this roster
    actually needs to help with day to day). Per the Local Government Code
    (RA 7160), its members are the Punong Barangay (presiding officer, LGC
    sec. 389(b) — and, unlike a City Mayor, a Sanggunian member who can author
    a measure, not just approve one), the elected Kagawad, and the SK
    Chairperson (ex-officio, LGC sec. 390). The Barangay Secretary/Treasurer
    attend but aren't Sanggunian members and can't author ordinances, so
    they're deliberately not options here.

    Only one active BARANGAY_CAPTAIN and one active SK_CHAIRPERSON are
    allowed at a time (there's only one seat each) — BARANGAY_KAGAWAD has no
    such limit (7 seats). Enforced in OrdinanceAuthorSerializer.validate, not
    here — see that module's SINGLE_SEAT_POSITIONS.
    """

    class Position(models.TextChoices):
        BARANGAY_CAPTAIN = "barangay_captain", "Punong Barangay (Barangay Captain)"
        BARANGAY_KAGAWAD = "barangay_kagawad", "Barangay Kagawad"
        SK_CHAIRPERSON = "sk_chairperson", "SK Chairperson"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    position = models.CharField(max_length=30, choices=Position.choices)
    # Term ended (election, resignation, etc.) — kept, not deleted, so past
    # ordinances' audit trail (who was on the roster and when) isn't lost;
    # only active authors are offered on Upload Ordinance.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_position_display()})"


class OrdinanceCategory(models.Model):
    """
    The category list Upload/Edit Ordinance's Category dropdown is built
    from — unlike OrdinanceAuthor, this one *is* a closed list (see
    OrdinanceCreateSerializer/OrdinanceUpdateSerializer's validate_category):
    Category exists to keep ordinances consistently filterable, which a
    free-for-all text field would undermine. An Administrator maintains this
    list (accounts.views.IsAdmin) rather than it being fixed in code, so a
    new category doesn't need a developer/redeploy — see migration
    0006_ordinancecategory's data migration for the built-in starting set
    (the same 10 extraction.py's OCR guesser already keys off of, plus
    "Other"), which is a starting point, not a permanent list.

    Like OrdinanceAuthor, an ordinance stores the category name as plain text
    at upload time (Ordinance.category), not a live FK — renaming or
    retiring a category here never rewrites an already-uploaded ordinance.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    # Retired rather than deleted by default (mirrors OrdinanceAuthor) so a
    # category already used by past ordinances doesn't just vanish from admin
    # bookkeeping; only active categories are offered on Upload Ordinance.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "ordinance categories"

    def __str__(self):
        return self.name


class OrdinanceDownload(models.Model):
    """
    Records that a citizen has downloaded a specific ordinance's PDF — each
    citizen gets exactly one download per ordinance (see
    OrdinanceDownloadView), enforced here via unique_together so a race
    between two near-simultaneous requests can't both slip through.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ordinance = models.ForeignKey(Ordinance, on_delete=models.CASCADE, related_name="downloads")
    citizen = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ordinance_downloads"
    )
    downloaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["ordinance", "citizen"]
        ordering = ["-downloaded_at"]
