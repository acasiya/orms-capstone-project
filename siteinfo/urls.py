from django.urls import path

from . import views

urlpatterns = [
    path("about/", views.AboutPublicView.as_view(), name="site_about"),
    path("profile/", views.BarangayProfileView.as_view(), name="site_profile"),
    path("council/", views.CouncilMemberListCreateView.as_view(), name="site_council_list_create"),
    path("council/reorder/", views.CouncilMemberReorderView.as_view(), name="site_council_reorder"),
    path("council/<uuid:pk>/", views.CouncilMemberDetailView.as_view(), name="site_council_detail"),
    path("logos/", views.AboutLogoListCreateView.as_view(), name="site_logo_list_create"),
    path("logos/reorder/", views.AboutLogoReorderView.as_view(), name="site_logo_reorder"),
    path("logos/<uuid:pk>/", views.AboutLogoDetailView.as_view(), name="site_logo_detail"),
]
