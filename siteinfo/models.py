import uuid

from django.db import models


class BarangayProfile(models.Model):
    """
    The single row behind the citizen About Us page's contact card and
    description cards, and the site footer's contact column (see
    frontend/citizen/js/site-footer.js). An Administrator edits it from the
    Admin Portal's About Us Setup page, since contact details and wording
    change over time (new hotline, new email, a new administration after an
    election) and shouldn't need a code change. Always pk=1 — use load().
    """

    name = models.CharField(max_length=100, default="Barangay Platero")
    city = models.CharField(max_length=100, default="City of Biñan, Laguna")
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    office_hours = models.CharField(max_length=120, blank=True)
    emergency_hotline = models.CharField(max_length=50, default="911")
    # About Us' "What is SafeSpace" and "Our Mission" cards.
    about_text = models.TextField(blank=True)
    mission_text = models.TextField(blank=True)
    # The barangay's outline on the staff incident heatmap, as a list of
    # [lat, lng] points (one closed ring; the first point isn't repeated).
    # Drawn or uploaded by an Administrator on the Map Boundary page. Empty
    # means no outline. OpenStreetMap has no Platero boundary and the PSA
    # 2023 polygon is too coarse for the app's street data, hence editable.
    boundary = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        profile, _ = cls.objects.get_or_create(pk=1)
        return profile

    def __str__(self):
        return self.name


class CouncilMember(models.Model):
    """
    One person in About Us' "Sangguniang Barangay" section. Managed by an
    Administrator because the roster changes with every barangay election —
    add the incoming officials (hidden) ahead of time, then flip visibility
    when the term turns over. `group` picks the row they appear in; `order`
    sorts within it.

    Separate from ordinances.OrdinanceAuthor on purpose: that roster is only
    the seats that can author an ordinance, while this one is the public
    face of the barangay (committee titles, photos, and appointed officers
    like the Secretary and Treasurer, who can't author ordinances).
    """

    class Group(models.TextChoices):
        CHAIRMAN = "chairman", "Punong Barangay (top row)"
        MEMBER = "member", "Sangguniang Barangay member"
        OFFICER = "officer", "Appointed officer (Secretary, Treasurer)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    # Shown under the name, e.g. "Committee Chairman on Education".
    position = models.CharField(max_length=255)
    group = models.CharField(max_length=10, choices=Group.choices, default=Group.MEMBER)
    photo = models.ImageField(upload_to="about/council/%Y/", blank=True)
    # Path under the frontend root for the portraits seeded with the app
    # (frontend/citizen/drawables/) — used until an Administrator uploads one.
    default_photo = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return f"{self.name} — {self.position}"


class AboutLogo(models.Model):
    """
    One seal in About Us' green logo strip (barangay seal, city seal, the
    current administration's logo). Editable because the administration's
    logo changes with the Punong Barangay.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    image = models.ImageField(upload_to="about/logos/", blank=True)
    default_image = models.CharField(max_length=255, blank=True)
    alt_text = models.CharField(max_length=150)
    order = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self):
        return self.alt_text
