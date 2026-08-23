from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from decouple import config

User = get_user_model()


class Command(BaseCommand):
    """
    Creates (or updates) a single Administrator account from environment
    variables, so a superuser can exist without needing Render Shell access
    on the free plan. Safe to run on every deploy — it's a no-op once the
    account already exists with the right role.

    Requires ADMIN_EMAIL and ADMIN_PASSWORD to be set as environment
    variables; does nothing if either is missing (e.g. in local dev where
    you'd rather use `createsuperuser` interactively).
    """

    help = "Creates the initial Administrator account from ADMIN_EMAIL / ADMIN_PASSWORD env vars."

    def handle(self, *args, **options):
        email = config("ADMIN_EMAIL", default=None)
        password = config("ADMIN_PASSWORD", default=None)

        if not email or not password:
            self.stdout.write("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation.")
            return

        user, created = User.objects.get_or_create(
            email=email,
            defaults={"username": email},
        )
        user.set_password(password)
        user.role = User.Role.ADMIN
        user.is_verified = True
        user.is_staff = True
        user.is_superuser = True
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} admin account: {email}"))
