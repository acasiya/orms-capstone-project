import uuid

from django.conf import settings
from django.db import models


class Report(models.Model):
    """An ordinance-violation report filed by a citizen (File Report)."""

    class Status(models.TextChoices):
        # Mirrors the 4 stages shown in the status timeline on the detail
        # pages exactly (Submitted -> Under Review -> In Action -> Resolved,
        # i.e. "Final Verdict" reached) — one status per stage, so which
        # stage is "done" is just this status's position in the list, not a
        # separate calculation. Remarks are a plain always-editable field
        # (see StaffReportUpdateSerializer/report-detail.js) rather than a
        # status of their own.
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        IN_ACTION = "in_action", "In Action"
        RESOLVED = "resolved", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    citizen = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports")
    location = models.CharField(max_length=255)
    # Free text rather than a FK — Ordinances aren't backed by a real model
    # yet (frontend/citizen/js/ordinances-data.js is still a hardcoded
    # array), so this just stores whichever option label the citizen picked.
    ordinance = models.CharField(max_length=255)
    incident_date = models.DateField()
    incident_time = models.TimeField()
    nature_of_violation = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    remarks = models.TextField(blank=True)
    # The Investigator working this report — Reports is a shared claimable
    # queue (see StaffReportClaimView/StaffReportForfeitView) rather than
    # pre-assigned, so this starts blank and any Investigator can claim an
    # unclaimed report. Visible to every Barangay Staff role (Barangay
    # Captain's Reports Dashboard shows a per-investigator breakdown from
    # this field too — see reports-dashboard.js's investigator chart).
    assigned_investigator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="claimed_reports"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ordinance} — {self.citizen} ({self.status})"


class ReportAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="reports/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)


class ConcernFolder(models.Model):
    """
    A staff-defined category concerns/suggestions can be filed under (e.g.
    "No Vaping in Public"). Exists to group similar concerns for the staff
    Concerns/Suggestions dashboard's category breakdown, the same role
    Report.ordinance plays for Reports.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Concern(models.Model):
    """A concern/suggestion filed by a citizen (Submit Suggestion)."""

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        RESOLVED = "resolved", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    citizen = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="concerns")
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    remarks = models.TextField(blank=True)
    # Optional — staff assign a concern to a folder after reviewing it; a
    # deleted folder just leaves its concerns unfoldered rather than deleting them.
    folder = models.ForeignKey(ConcernFolder, on_delete=models.SET_NULL, null=True, blank=True, related_name="concerns")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Concern from {self.citizen} ({self.status})"


class ConcernAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    concern = models.ForeignKey(Concern, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="concerns/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)


class Question(models.Model):
    """
    A question a citizen asks from the FAQs page — answered by Staff/Admin
    (see StaffQuestionAnswerView). Deliberately has no "status" field like
    Report/Concern do: whether it's answered is just whether `answer` is
    non-empty, since there's nothing in between "asked" and "answered" here.
    Stays visible (never deleted) after being answered — see the FAQ model
    below for why: an admin scanning answered questions for a pattern worth
    promoting into a public FAQ needs the history to still be there.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    citizen = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="questions")
    question = models.TextField()
    answer = models.TextField(blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="answered_questions"
    )
    answered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Question from {self.citizen}: {self.question[:50]}"

    @property
    def is_answered(self):
        return bool(self.answer)


class FAQ(models.Model):
    """
    One entry on the public citizen FAQs page. Curated by Admin directly —
    separate from Question above (a citizen's one-off question) rather than
    the same model, since a FAQ is meant to read as a general, polished
    answer rather than a reply to one specific person's wording.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.CharField(max_length=255)
    answer = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "FAQ"
        verbose_name_plural = "FAQs"

    def __str__(self):
        return self.question
