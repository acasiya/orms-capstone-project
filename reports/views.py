from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, log_action
from accounts.views import IsAdmin, IsStaffOrAdmin
from orms_backend.emails import (
    send_question_answered_email,
    send_report_resolved_email,
    send_report_submitted_citizen_email,
    send_report_submitted_staff_emails,
    send_suggestion_submitted_citizen_email,
    send_suggestion_submitted_staff_emails,
)

from .models import FAQ, Concern, ConcernFolder, Question, Report
from .serializers import (
    FAQSerializer,
    ConcernFolderSerializer,
    ConcernSerializer,
    QuestionSerializer,
    ReportSerializer,
    StaffConcernSerializer,
    StaffConcernUpdateSerializer,
    StaffQuestionAnswerSerializer,
    StaffQuestionSerializer,
    StaffReportSerializer,
    StaffReportUpdateSerializer,
)


def _staff_recipients():
    return User.objects.filter(role=User.Role.STAFF, is_active=True)


class ReportListCreateView(generics.ListCreateAPIView):
    """
    GET /api/reports/ — the logged-in citizen's own filed reports (My Reports).
    POST /api/reports/ — file a new report (File Report page).
    """
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Report.objects.filter(citizen=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}

    def perform_create(self, serializer):
        report = serializer.save()
        log_action(self.request.user, f"Submitted a report — {report.ordinance}")
        send_report_submitted_citizen_email(report)
        send_report_submitted_staff_emails(report, _staff_recipients())


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
    GET /api/reports/staff/<id>/ — full detail of any citizen's report.
    PATCH /api/reports/staff/<id>/ — updates status/remarks only (see
    StaffReportUpdateSerializer for why nothing else is writable here).
    """
    permission_classes = [IsStaffOrAdmin]

    def get_object(self, pk):
        return get_object_or_404(Report.objects.select_related("citizen"), pk=pk)

    def get(self, request, pk):
        report = self.get_object(pk)
        return Response(StaffReportSerializer(report, context={"request": request}).data)

    def patch(self, request, pk):
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


class StaffConcernListView(generics.ListAPIView):
    """GET /api/concerns/staff/ — every citizen's submitted concerns/suggestions (Staff/Admin Dashboard)."""
    queryset = Concern.objects.select_related("citizen", "folder").all()
    serializer_class = StaffConcernSerializer
    permission_classes = [IsStaffOrAdmin]

    def get_serializer_context(self):
        return {"request": self.request}


class StaffConcernDetailView(APIView):
    """
    GET /api/concerns/staff/<id>/ — full detail of any citizen's concern/suggestion.
    PATCH /api/concerns/staff/<id>/ — updates status/remarks/folder only.
    """
    permission_classes = [IsStaffOrAdmin]

    def get_object(self, pk):
        return get_object_or_404(Concern.objects.select_related("citizen", "folder"), pk=pk)

    def get(self, request, pk):
        concern = self.get_object(pk)
        return Response(StaffConcernSerializer(concern, context={"request": request}).data)

    def patch(self, request, pk):
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
    GET /api/concerns/folders/ — every folder, with how many concerns are in it.
    POST /api/concerns/folders/ — create a new folder (Concerns/Suggestions sidebar).
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer
    permission_classes = [IsStaffOrAdmin]

    def perform_create(self, serializer):
        folder = serializer.save()
        log_action(self.request.user, f"Created folder '{folder.name}'")


class ConcernFolderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH /api/concerns/folders/<id>/ — rename a folder.
    DELETE /api/concerns/folders/<id>/ — delete a folder; its concerns fall back to unfoldered (see Concern.folder).
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer
    permission_classes = [IsStaffOrAdmin]

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
