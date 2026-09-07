import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from .matching import suggest_ordinances
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


class OrdinanceSuggestTests(APITestCase):
    def setUp(self):
        self.secretary = User.objects.create_user(
            username="sec2", email="sec2@test.com", password="x", role=User.Role.STAFF, position="Secretary"
        )
        self.business = Ordinance.objects.create(
            number="No. 1-(2026)", title="Business Permit Renewal", author="Hon. Test",
            category="Business", date_approved=datetime.date.today(),
            description="Requirements and deadlines for renewing a business permit annually.",
            uploaded_by=self.secretary,
        )
        self.curfew = Ordinance.objects.create(
            number="No. 2-(2026)", title="Minor Curfew Ordinance", author="Hon. Test",
            category="Public Order", date_approved=datetime.date.today(),
            description="Prohibits minors from being in public places late at night without a guardian.",
            uploaded_by=self.secretary,
        )

    def test_relevant_query_ranks_matching_ordinance_first(self):
        response = self.client.get("/api/ordinances/suggest/", {"q": "my minor child was out past midnight alone"})
        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertTrue(results)
        self.assertEqual(results[0]["id"], str(self.curfew.id))

    def test_short_query_returns_empty(self):
        response = self.client.get("/api/ordinances/suggest/", {"q": "hi"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_missing_query_returns_empty(self):
        response = self.client.get("/api/ordinances/suggest/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_archived_ordinance_never_suggested(self):
        self.curfew.is_archived = True
        self.curfew.save()
        response = self.client.get("/api/ordinances/suggest/", {"q": "my minor child was out past midnight alone"})
        ids = [r["id"] for r in response.data["results"]]
        self.assertNotIn(str(self.curfew.id), ids)

    def test_unrelated_query_below_threshold_returns_empty(self):
        response = self.client.get("/api/ordinances/suggest/", {"q": "asdf qwer zxcv nonsense words"})
        self.assertEqual(response.data["results"], [])

    def test_fewer_than_two_ordinances_returns_empty(self):
        Ordinance.objects.all().delete()
        Ordinance.objects.create(
            number="No. 3-(2026)", title="Solo Ordinance", author="Hon. Test",
            category="Test", date_approved=datetime.date.today(), description="Only one exists.",
        )
        response = self.client.get("/api/ordinances/suggest/", {"q": "solo ordinance test query text here"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])


class SuggestOrdinancesFunctionTests(TestCase):
    def test_empty_ordinances_returns_empty(self):
        self.assertEqual(suggest_ordinances("noise complaint", []), [])

    def test_blank_query_returns_empty(self):
        ordinance = Ordinance(title="A", category="B", description="C")
        self.assertEqual(suggest_ordinances("   ", [ordinance, ordinance]), [])
