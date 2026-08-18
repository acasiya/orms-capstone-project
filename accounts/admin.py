from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User, VoterVerification


class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ["email", "username", "role", "is_verified", "is_staff"]
    fieldsets = UserAdmin.fieldsets + (
        ("O.R.M.S. fields", {"fields": ("role", "contact_number", "address", "is_verified")}),
    )


admin.site.register(User, CustomUserAdmin)
admin.site.register(VoterVerification)
