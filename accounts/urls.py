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
]
