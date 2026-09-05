from django.urls import path

from . import views

urlpatterns = [
    path("ordinances/", views.OrdinanceListCreateView.as_view(), name="ordinance_list_create"),
    path("ordinances/<uuid:pk>/", views.OrdinanceDetailView.as_view(), name="ordinance_detail"),
    path("ordinances/<uuid:pk>/archive/", views.OrdinanceArchiveView.as_view(), name="ordinance_archive"),
    path("ordinances/<uuid:pk>/unarchive/", views.OrdinanceUnarchiveView.as_view(), name="ordinance_unarchive"),
]
