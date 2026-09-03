from django.urls import path

from . import views

urlpatterns = [
    path("reports/staff/", views.StaffReportListView.as_view(), name="staff_report_list"),
    path("reports/staff/<uuid:pk>/", views.StaffReportDetailView.as_view(), name="staff_report_detail"),
    path("reports/staff/<uuid:pk>/claim/", views.StaffReportClaimView.as_view(), name="staff_report_claim"),
    path("reports/staff/<uuid:pk>/forfeit/", views.StaffReportForfeitView.as_view(), name="staff_report_forfeit"),
    path("reports/", views.ReportListCreateView.as_view(), name="report_list_create"),
    path("reports/<uuid:pk>/", views.ReportDetailView.as_view(), name="report_detail"),
    path("concerns/staff/", views.StaffConcernListView.as_view(), name="staff_concern_list"),
    path("concerns/staff/<uuid:pk>/", views.StaffConcernDetailView.as_view(), name="staff_concern_detail"),
    path("concerns/folders/", views.ConcernFolderListCreateView.as_view(), name="concern_folder_list_create"),
    path("concerns/folders/<uuid:pk>/", views.ConcernFolderDetailView.as_view(), name="concern_folder_detail"),
    path("concerns/", views.ConcernListCreateView.as_view(), name="concern_list_create"),
    path("concerns/<uuid:pk>/", views.ConcernDetailView.as_view(), name="concern_detail"),
    path("questions/staff/", views.StaffQuestionListView.as_view(), name="staff_question_list"),
    path("questions/staff/<uuid:pk>/", views.StaffQuestionAnswerView.as_view(), name="staff_question_answer"),
    path("questions/", views.QuestionListCreateView.as_view(), name="question_list_create"),
    path("faqs/admin/", views.AdminFAQListCreateView.as_view(), name="admin_faq_list_create"),
    path("faqs/admin/<uuid:pk>/", views.AdminFAQDetailView.as_view(), name="admin_faq_detail"),
    path("faqs/", views.FAQListView.as_view(), name="faq_list"),
]
