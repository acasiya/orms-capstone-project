from django.urls import path

from . import views

urlpatterns = [
    path("reports/staff/", views.StaffReportListView.as_view(), name="staff_report_list"),
    path("reports/staff/<uuid:pk>/", views.StaffReportDetailView.as_view(), name="staff_report_detail"),
    path("reports/", views.ReportListCreateView.as_view(), name="report_list_create"),
    path("reports/<uuid:pk>/", views.ReportDetailView.as_view(), name="report_detail"),
    path("concerns/staff/", views.StaffConcernListView.as_view(), name="staff_concern_list"),
    path("concerns/staff/<uuid:pk>/", views.StaffConcernDetailView.as_view(), name="staff_concern_detail"),
    path("concerns/", views.ConcernListCreateView.as_view(), name="concern_list_create"),
    path("concerns/<uuid:pk>/", views.ConcernDetailView.as_view(), name="concern_detail"),
]
