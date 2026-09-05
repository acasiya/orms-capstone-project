import datetime

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from .models import Ordinance

User = get_user_model()


class OrdinanceArchiveTests(APITestCase):
    def setUp(self):
        self.secretary = User.objects.create_user(
            username="sec", email="sec@test.com", password="x", role=User.Role.STAFF, position="Secretary"
        )
        self.captain = User.objects.create_user(
            username="cap", email="cap@test.com", password="x", role=User.Role.STAFF, position="Barangay Captain"
        )
        self.ordinance = Ordinance.objects.create(
            number="No. 1-(2026)", title="Test Ordinance", author="Hon. Test",
            category="Test", date_approved=datetime.date.today(), description="desc",
            uploaded_by=self.secretary,
        )

    def test_public_list_shows_uploader_and_hides_archived(self):
        response = self.client.get("/api/ordinances/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["uploaded_by_name"], "sec")
        self.assertFalse(response.data[0]["is_archived"])

        self.ordinance.is_archived = True
        self.ordinance.save()
        response = self.client.get("/api/ordinances/")
        self.assertEqual(response.data, [])

    def test_staff_list_still_sees_archived(self):
        self.ordinance.is_archived = True
        self.ordinance.save()
        self.client.force_authenticate(self.captain)
        response = self.client.get("/api/ordinances/")
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]["is_archived"])

    def test_secretary_can_archive_and_it_is_logged(self):
        self.client.force_authenticate(self.secretary)
        response = self.client.post(f"/api/ordinances/{self.ordinance.id}/archive/")
        self.assertEqual(response.status_code, 200)
        self.ordinance.refresh_from_db()
        self.assertTrue(self.ordinance.is_archived)
        self.assertTrue(AuditLog.objects.filter(action__icontains="Archived ordinance").exists())

        response = self.client.get("/api/ordinances/")
        self.assertEqual(len(response.data), 1)  # staff still sees it

        response = self.client.post(f"/api/ordinances/{self.ordinance.id}/unarchive/")
        self.assertEqual(response.status_code, 200)
        self.ordinance.refresh_from_db()
        self.assertFalse(self.ordinance.is_archived)
        self.assertTrue(AuditLog.objects.filter(action__icontains="Unarchived ordinance").exists())

    def test_captain_cannot_archive(self):
        self.client.force_authenticate(self.captain)
        response = self.client.post(f"/api/ordinances/{self.ordinance.id}/archive/")
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_archive(self):
        response = self.client.post(f"/api/ordinances/{self.ordinance.id}/archive/")
        self.assertIn(response.status_code, (401, 403))
