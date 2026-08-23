"""
Django settings for orms_backend project.
"""

from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Core / security -------------------------------------------------------
# All of these come from environment variables so nothing secret is
# committed to GitHub. Set them in Render's dashboard (or a local .env file
# for development — see .env.example).

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# Render's health checks and the deployed URL both need to be trusted for
# CSRF once DEBUG is off.
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

AUTH_USER_MODEL = "accounts.User"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "orms_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "orms_backend.wsgi.application"

# --- Database ----------------------------------------------------------
# Reads DATABASE_URL from the environment (Render/Neon/Supabase all provide
# this format). Falls back to local sqlite for quick local dev without
# needing Postgres installed.

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

# --- Static files & the existing frontend -------------------------------
# collectstatic output (DRF's browsable API assets, Django admin CSS, etc.)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# The citizen/staff/admin portals (plain HTML/CSS/JS) are served directly
# from the project root ("/citizen/...", "/staff/...", "/admin-portal/...")
# by WhiteNoise, so the whole system — API + frontend — is one deployable
# unit with one URL. This is what WHITENOISE_ROOT is for: files here are
# served from "/", separately from the STATIC_URL-prefixed app assets above.
WHITENOISE_ROOT = BASE_DIR / "frontend"
WHITENOISE_INDEX_FILE = "index.html"

# User-uploaded files (voter's ID images, evidence photos/videos). On Render
# this directory does NOT persist across deploys — swap to Cloudinary/S3
# via django-storages before relying on this for real evidence uploads.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework + JWT ----------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    # Without this, Django's last_login field never updates on JWT login,
    # which would make the admin Manage Accounts "Active"/last-active status
    # meaningless (every account would permanently show "Never logged in").
    "UPDATE_LAST_LOGIN": True,
}

# --- CORS ----------------------------------------------------------------
# Frontend is served from the same origin via WhiteNoise above, so CORS
# usually isn't even hit in production. This stays enabled for local dev,
# where the frontend might be opened from a different port/tool.
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_ALL_ORIGINS = DEBUG
