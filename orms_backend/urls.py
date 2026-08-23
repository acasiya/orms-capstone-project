"""
URL configuration for orms_backend.

Note: Django's built-in admin panel is moved to /django-admin/ instead of
the usual /admin/, because the existing frontend already uses /admin/ for
the Barangay Admin Portal (frontend/admin/). Both can coexist this way —
WhiteNoise serves the static /admin/*.html files, Django only owns
/django-admin/ and /api/.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("reports.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
