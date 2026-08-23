from django.urls import path

from . import views

urlpatterns = [
    path("reports/", views.ReportListCreateView.as_view(), name="report_list_create"),
    path("reports/<uuid:pk>/", views.ReportDetailView.as_view(), name="report_detail"),
    path("concerns/", views.ConcernListCreateView.as_view(), name="concern_list_create"),
    path("concerns/<uuid:pk>/", views.ConcernDetailView.as_view(), name="concern_detail"),
]
