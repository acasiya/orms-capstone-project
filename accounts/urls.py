from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("admin/create-user/", views.AdminCreateUserView.as_view(), name="admin_create_user"),
    path("admin/users/", views.AdminListUsersView.as_view(), name="admin_list_users"),
    path("admin/users/<uuid:pk>/", views.AdminAccountDetailView.as_view(), name="admin_account_detail"),
    path("admin/users/<uuid:pk>/reset-password/", views.AdminResetPasswordView.as_view(), name="admin_reset_password"),
    path("admin/verifications/", views.AdminListPendingVerificationsView.as_view(), name="admin_list_verifications"),
    path("admin/verifications/<uuid:pk>/approve/", views.AdminApproveVerificationView.as_view(), name="admin_approve_verification"),
    path("admin/verifications/<uuid:pk>/reject/", views.AdminRejectVerificationView.as_view(), name="admin_reject_verification"),
]
