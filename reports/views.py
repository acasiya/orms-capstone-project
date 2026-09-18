import random
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, log_action
from accounts.views import IsAdmin, IsInvestigatorOrAdmin, IsSecretaryOrAdmin, IsStaffOrAdmin
from orms_backend.emails import (
    send_question_answered_email,
    send_report_resolved_email,
    send_report_submitted_citizen_email,
    send_report_submitted_staff_emails,
    send_report_verification_code_email,
    send_suggestion_submitted_citizen_email,
    send_suggestion_submitted_staff_emails,
)

from .models import FAQ, Concern, ConcernFolder, Question, Report, ReportVerificationCode
from .serializers import (
    FAQSerializer,
    ConcernFolderSerializer,
    ConcernSerializer,
    QuestionSerializer,
    ReportSerializer,
    ReportVerifyCodeSerializer,
    StaffConcernSerializer,
    StaffConcernUpdateSerializer,
    StaffQuestionAnswerSerializer,
    StaffQuestionSerializer,
    StaffReportSerializer,
    StaffReportUpdateSerializer,
)
from .verification import (
    check_and_apply_abuse_lockout,
    cooldown_remaining,
    has_valid_verification,
    verification_required,
)


def _staff_recipients():
    return User.objects.filter(role=User.Role.STAFF, is_active=True)


class ReportListCreateView(generics.ListCreateAPIView):
    """
    GET /api/reports/ — the logged-in citizen's own filed reports (My Reports).
    POST /api/reports/ — file a new report (File Report page). Gated by
    reports/verification.py's three anti-abuse checks — see that module's
    docstring for the full picture.
    """
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Report.objects.filter(citizen=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        user = request.user

        remaining = cooldown_remaining(user)
        if remaining is not None:
            minutes = max(1, int(remaining.total_seconds() // 60) + 1)
            return Response(
                {"detail": f"You can file another report in about {minutes} minute(s)."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if verification_required(user) and not has_valid_verification(user):
            return Response(
                {
                    "detail": "Please verify your email before filing this report.",
                    "verification_required": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        response = super().create(request, *args, **kwargs)

        if response.status_code == status.HTTP_201_CREATED:
            # Consumed on success so the next report needs fresh verification
            # once REVERIFY_AFTER_DAYS rolls around again.
            ReportVerificationCode.objects.filter(user=user, verified_at__isnull=False).delete()
            check_and_apply_abuse_lockout(user)

        return response

    def perform_create(self, serializer):
        report = serializer.save()
        log_action(self.request.user, f"Submitted a report — {report.ordinance}")
        send_report_submitted_citizen_email(report)
        send_report_submitted_staff_emails(report, _staff_recipients())


class ReportVerificationStatusView(APIView):
    """
    GET /api/reports/verification-status/ — File Report calls this on load
    to decide whether to show the "verify it's you" gate and/or a cooldown
    notice before the citizen even starts filling out the form.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        remaining = cooldown_remaining(user)
        return Response({
            "verification_required": verification_required(user) and not has_valid_verification(user),
            "cooldown_seconds": int(remaining.total_seconds()) if remaining is not None else 0,
        })


class ReportSendVerificationView(APIView):
    """POST /api/reports/send-verification/ — emails a fresh 6-digit code to confirm the report filer's identity."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        code = f"{random.randint(0, 999999):06d}"
        ReportVerificationCode.objects.create(
            user=user,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=ReportVerificationCode.CODE_TTL_MINUTES),
        )
        send_report_verification_code_email(user, code, ReportVerificationCode.CODE_TTL_MINUTES)
        return Response({"detail": "A verification code has been sent to your email."})


class ReportVerifyCodeView(APIView):
    """POST /api/reports/verify-code/ — checks the code sent by ReportSendVerificationView."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ReportVerifyCodeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Verified."})


class ReportDetailView(generics.RetrieveAPIView):
    """GET /api/reports/<id>/ — one of the logged-in citizen's own reports."""
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Report.objects.filter(citizen=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}


class ConcernListCreateView(generics.ListCreateAPIView):
    """
    GET /api/concerns/ — the logged-in citizen's own submitted concerns/
    suggestions (My Concerns/Suggestions).
    POST /api/concerns/ — submit a new one (Submit Suggestion page).
    """
    serializer_class = ConcernSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Concern.objects.filter(citizen=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}

    def perform_create(self, serializer):
        concern = serializer.save()
        log_action(self.request.user, "Submitted a suggestion")
        send_suggestion_submitted_citizen_email(concern)
        send_suggestion_submitted_staff_emails(concern, _staff_recipients())


class ConcernDetailView(generics.RetrieveAPIView):
    """GET /api/concerns/<id>/ — one of the logged-in citizen's own concerns/suggestions."""
    serializer_class = ConcernSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Concern.objects.filter(citizen=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}


class StaffReportListView(generics.ListAPIView):
    """GET /api/reports/staff/ — every citizen's filed reports (Staff/Admin Reports Dashboard)."""
    queryset = Report.objects.select_related("citizen").all()
    serializer_class = StaffReportSerializer
    permission_classes = [IsStaffOrAdmin]

    def get_serializer_context(self):
        return {"request": self.request}


class StaffReportDetailView(APIView):
    """
    GET /api/reports/staff/<id>/ — full detail of any citizen's report; open
    to every Staff role, since Barangay Captain's Reports Dashboard and
    Secretary both need to at least view a report.
    PATCH /api/reports/staff/<id>/ — updates status/remarks only (see
    StaffReportUpdateSerializer for why nothing else is writable here).
    Investigator/Admin only — Reports is the Investigator's section (see
    IsInvestigatorOrAdmin); Captain's dashboard is read-only.
    """
    permission_classes = [IsStaffOrAdmin]

    def get_object(self, pk):
        return get_object_or_404(Report.objects.select_related("citizen", "assigned_investigator"), pk=pk)

    def get(self, request, pk):
        report = self.get_object(pk)
        return Response(StaffReportSerializer(report, context={"request": request}).data)

    def patch(self, request, pk):
        if not IsInvestigatorOrAdmin().has_permission(request, self):
            return Response(
                {"detail": "Only an Investigator can update a report's status."}, status=403
            )

        report = self.get_object(pk)
        previous_status = report.status
        serializer = StaffReportUpdateSerializer(report, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if "status" in request.data and report.status != previous_status:
            log_action(request.user, f"Updated a report's status to {report.get_status_display()}")
        if "remarks" in request.data:
            log_action(request.user, "Updated a report's remarks")

        # Only on the transition INTO Resolved (the status timeline's "Final
        # Verdict" stage), not every save while already resolved — otherwise
        # re-saving the same status would re-notify every time. Remarks, if
        # any were left, are included in this same email rather than a
        # separate one (see report_resolved.html).
        if report.status == Report.Status.RESOLVED and previous_status != Report.Status.RESOLVED:
            send_report_resolved_email(report)

        return Response(StaffReportSerializer(report, context={"request": request}).data)


class StaffReportClaimView(APIView):
    """
    POST /api/reports/staff/<id>/claim/ — an Investigator claims an
    unclaimed report, putting their name on it so other Investigators and
    Barangay Captain can see who's working it (see
    StaffReportSerializer.assignedInvestigator). Rejects claiming one
    someone else already has — see StaffReportForfeitView for giving it up.
    """
    permission_classes = [IsInvestigatorOrAdmin]

    def post(self, request, pk):
        report = get_object_or_404(Report.objects.select_related("citizen", "assigned_investigator"), pk=pk)
        if report.assigned_investigator_id and report.assigned_investigator_id != request.user.id:
            return Response(
                {"detail": f"This report is already claimed by {report.assigned_investigator.get_full_name() or report.assigned_investigator.username}."},
                status=400,
            )
        report.assigned_investigator = request.user
        report.save(update_fields=["assigned_investigator"])
        log_action(request.user, f"Claimed a report — {report.ordinance}")
        return Response(StaffReportSerializer(report, context={"request": request}).data)


class StaffReportForfeitView(APIView):
    """
    POST /api/reports/staff/<id>/forfeit/ — the Investigator who claimed a
    report gives it up, freeing it for anyone else to claim. Only the
    Investigator who actually holds the claim can forfeit it (Admin can
    too, as a way to free up a report on someone's behalf).
    """
    permission_classes = [IsInvestigatorOrAdmin]

    def post(self, request, pk):
        report = get_object_or_404(Report.objects.select_related("citizen", "assigned_investigator"), pk=pk)
        if report.assigned_investigator_id and report.assigned_investigator_id != request.user.id and request.user.role != User.Role.ADMIN:
            return Response({"detail": "You can only forfeit a report you've claimed yourself."}, status=403)
        report.assigned_investigator = None
        report.save(update_fields=["assigned_investigator"])
        log_action(request.user, f"Forfeited a report — {report.ordinance}")
        return Response(StaffReportSerializer(report, context={"request": request}).data)


class StaffConcernListView(generics.ListAPIView):
    """GET /api/concerns/staff/ — every citizen's submitted concerns/suggestions (Staff/Admin Dashboard)."""
    queryset = Concern.objects.select_related("citizen", "folder").all()
    serializer_class = StaffConcernSerializer
    permission_classes = [IsStaffOrAdmin]

    def get_serializer_context(self):
        return {"request": self.request}


class StaffConcernDetailView(APIView):
    """
    GET /api/concerns/staff/<id>/ — full detail of any citizen's concern/
    suggestion; open to every Staff role (Barangay Captain's dashboard
    needs to at least view one).
    PATCH /api/concerns/staff/<id>/ — updates status/remarks/folder only.
    Secretary/Admin only — Concerns/Suggestions is the Secretary's section
    (see IsSecretaryOrAdmin); Captain's dashboard is read-only.
    """
    permission_classes = [IsStaffOrAdmin]

    def get_object(self, pk):
        return get_object_or_404(Concern.objects.select_related("citizen", "folder"), pk=pk)

    def get(self, request, pk):
        concern = self.get_object(pk)
        return Response(StaffConcernSerializer(concern, context={"request": request}).data)

    def patch(self, request, pk):
        if not IsSecretaryOrAdmin().has_permission(request, self):
            return Response(
                {"detail": "Only the Secretary can update a concern/suggestion."}, status=403
            )

        concern = self.get_object(pk)
        previous_status = concern.status
        serializer = StaffConcernUpdateSerializer(concern, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if "status" in request.data and concern.status != previous_status:
            log_action(request.user, f"Updated a concern/suggestion's status to {concern.get_status_display()}")
        if "remarks" in request.data:
            log_action(request.user, "Updated a concern/suggestion's remarks")
        if "folder" in request.data:
            log_action(request.user, "Moved a concern/suggestion to a different folder")

        return Response(StaffConcernSerializer(concern, context={"request": request}).data)


class ConcernFolderListCreateView(generics.ListCreateAPIView):
    """
    GET /api/concerns/folders/ — every folder, with how many concerns are in
    it; open to every Staff role.
    POST /api/concerns/folders/ — create a new folder (Concerns/Suggestions
    sidebar) — Secretary/Admin only, same as everything else on that page.
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSecretaryOrAdmin()]
        return [IsStaffOrAdmin()]

    def perform_create(self, serializer):
        folder = serializer.save()
        log_action(self.request.user, f"Created folder '{folder.name}'")


class ConcernFolderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET open to every Staff role.
    PATCH /api/concerns/folders/<id>/ — rename a folder.
    DELETE /api/concerns/folders/<id>/ — delete a folder; its concerns fall
    back to unfoldered (see Concern.folder). Both Secretary/Admin only.
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "DELETE"):
            return [IsSecretaryOrAdmin()]
        return [IsStaffOrAdmin()]

    def perform_update(self, serializer):
        folder = serializer.save()
        log_action(self.request.user, f"Renamed a folder to '{folder.name}'")

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        log_action(self.request.user, f"Deleted folder '{name}'")


class QuestionListCreateView(generics.ListCreateAPIView):
    """
    GET /api/questions/ — the logged-in citizen's own asked questions, with
    any answer (FAQs page's "My Questions").
    POST /api/questions/ — ask a new one (FAQs page's "Ask a Question").
    """
    serializer_class = QuestionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Question.objects.filter(citizen=self.request.user)


class FAQListView(generics.ListAPIView):
    """GET /api/faqs/ — the public, curated FAQ list (FAQs page). Open to guests, like Ordinances."""
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer
    permission_classes = [permissions.AllowAny]


class StaffQuestionListView(generics.ListAPIView):
    """GET /api/questions/staff/ — every citizen's asked question (Staff/Admin Questions page)."""
    queryset = Question.objects.select_related("citizen").all()
    serializer_class = StaffQuestionSerializer
    permission_classes = [IsStaffOrAdmin]


class StaffQuestionAnswerView(APIView):
    """
    PATCH /api/questions/staff/<id>/ — answers a question. Stays visible
    (not deleted/hidden) afterward — see Question's docstring — so it keeps
    showing here, just marked answered, for Admin to spot a pattern worth
    promoting into a real FAQ (see AdminFAQListCreateView).
    """
    permission_classes = [IsStaffOrAdmin]

    def patch(self, request, pk):
        question = get_object_or_404(Question, pk=pk)
        serializer = StaffQuestionAnswerSerializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(answered_by=request.user, answered_at=timezone.now())
        log_action(request.user, "Answered a citizen's question")
        send_question_answered_email(question)
        return Response(StaffQuestionSerializer(question).data)


class AdminFAQListCreateView(generics.ListCreateAPIView):
    """
    GET /api/faqs/admin/ — every FAQ, for the Admin Questions page's "Manage
    FAQs" section.
    POST /api/faqs/admin/ — add a new one — either from scratch, or an admin
    promoting a citizen question that keeps coming up (see Question).
    Admin-only — Staff can view/answer citizen questions but doesn't curate
    the public FAQ list.
    """
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        faq = serializer.save()
        log_action(self.request.user, f"Added an FAQ: {faq.question[:60]}")


class AdminFAQDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/faqs/admin/<id>/ — edit or remove an existing FAQ."""
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        faq = serializer.save()
        log_action(self.request.user, f"Updated an FAQ: {faq.question[:60]}")

    def perform_destroy(self, instance):
        question = instance.question[:60]
        instance.delete()
        log_action(self.request.user, f"Deleted an FAQ: {question}")
