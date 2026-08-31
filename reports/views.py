from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.views import IsStaffOrAdmin
from orms_backend.emails import (
    send_report_resolved_email,
    send_report_submitted_citizen_email,
    send_report_submitted_staff_emails,
    send_suggestion_submitted_citizen_email,
    send_suggestion_submitted_staff_emails,
)

from .models import Concern, ConcernFolder, Report
from .serializers import (
    ConcernFolderSerializer,
    ConcernSerializer,
    ReportSerializer,
    StaffConcernSerializer,
    StaffConcernUpdateSerializer,
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
        serializer = StaffConcernUpdateSerializer(concern, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StaffConcernSerializer(concern, context={"request": request}).data)


class ConcernFolderListCreateView(generics.ListCreateAPIView):
    """
    GET /api/concerns/folders/ — every folder, with how many concerns are in it.
    POST /api/concerns/folders/ — create a new folder (Concerns/Suggestions sidebar).
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer
    permission_classes = [IsStaffOrAdmin]


class ConcernFolderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH /api/concerns/folders/<id>/ — rename a folder.
    DELETE /api/concerns/folders/<id>/ — delete a folder; its concerns fall back to unfoldered (see Concern.folder).
    """
    queryset = ConcernFolder.objects.all()
    serializer_class = ConcernFolderSerializer
    permission_classes = [IsStaffOrAdmin]
