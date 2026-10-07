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
from django.views.generic.base import RedirectView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("reports.urls")),
    path("api/", include("ordinances.urls")),
    path("api/site/", include("siteinfo.urls")),
    path("api/announcements/", include("announcements.urls")),
    # The citizen login used to live at /citizen/login/ (a folder with its own
    # index.html) before it was flattened to /citizen/login.html — this keeps
    # any old bookmark or cached link working instead of 404ing.
    path("citizen/login/", RedirectView.as_view(url="/citizen/login.html", permanent=False)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
