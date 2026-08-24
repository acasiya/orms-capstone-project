from django.urls import path

from . import views

urlpatterns = [
    path("ordinances/", views.OrdinanceListCreateView.as_view(), name="ordinance_list_create"),
    path("ordinances/<uuid:pk>/", views.OrdinanceDetailView.as_view(), name="ordinance_detail"),
]
