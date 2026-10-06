from django.core import mail
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User

from .models import Announcement, AnnouncementView


def _auth(client, user):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")


class AnnouncementTests(TestCase):
    def setUp(self):
        self.secretary = User.objects.create_user(
            username="sec", email="sec@test.com", password="x", role=User.Role.STAFF,
            position="Secretary", is_verified=True,
        )
        self.investigator = User.objects.create_user(
            username="inv", email="inv@test.com", password="x", role=User.Role.STAFF,
            position="Investigator", is_verified=True,
        )
        self.citizen = User.objects.create_user(
            username="cit", email="cit@test.com", password="x", is_verified=True,
        )
        self.client = APIClient()

    def test_secretary_can_post_and_every_citizen_is_emailed(self):
        _auth(self.client, self.secretary)
        response = self.client.post(
            "/api/announcements/staff/", {"title": "Clean-up drive", "description": "Saturday 7AM."}, format="multipart"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Announcement.objects.count(), 1)
        self.assertEqual(Announcement.objects.get().posted_by, self.secretary)
        recipients = [addr for m in mail.outbox for addr in m.to]
        self.assertIn("cit@test.com", recipients)
        self.assertNotIn("inv@test.com", recipients)
        self.assertTrue(any("/citizen/home.html" in m.body or "/citizen/home.html" in m.alternatives[0][0] for m in mail.outbox))

    def test_investigator_cannot_post(self):
        _auth(self.client, self.investigator)
        response = self.client.post(
            "/api/announcements/staff/", {"title": "x", "description": "y"}, format="multipart"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Announcement.objects.count(), 0)

    def test_unread_banner_clears_after_marking_viewed(self):
        announcement = Announcement.objects.create(title="Hi", description="There")
        _auth(self.client, self.citizen)
        self.assertFalse(self.client.get("/api/announcements/").json()[0]["is_read"])

        self.assertEqual(self.client.post(f"/api/announcements/{announcement.id}/view/").status_code, 200)
        self.assertTrue(self.client.get("/api/announcements/").json()[0]["is_read"])
        self.assertEqual(AnnouncementView.objects.filter(user=self.citizen).count(), 1)

    def test_guest_sees_announcements_without_read_state(self):
        Announcement.objects.create(title="Hi", description="There")
        guest = APIClient()
        data = guest.get("/api/announcements/").json()
        self.assertEqual(len(data), 1)
        self.assertFalse(data[0]["is_read"])
