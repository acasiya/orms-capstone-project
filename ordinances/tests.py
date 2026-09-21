import datetime

import pymupdf
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from .extraction import parse_fields
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


# Trimmed from real OCR output of a scanned city ordinance — including its
# quirks (words run together, spaces missing around "No." and dates).
SCANNED_CITY_ORDINANCE = """Republic of the Philippines
OFFICE OFTHECITY COUNCIL
ORDINANCE APPROVED BYTHE CITYCOUNCILOFBINAN,LAGUNA IN ITS
REGULAR SESSIONHELDATCITYHALLANNEXBUILDING,DATEDNOVEMBER17.2025.
PRESENT:
Hon. JONALINA R.REYES
CITYORDINANCENO.31-(2025)
AN ORDINANCE INSTITUTIONALIZINGTHE POLYCYSTIC OVARY SYNDROME
(PCOS)AWARENESSANDADOLESCENTREPRODUCTIVEHEALTHPROGRAM
Authored by: Hon. Jonalina R.Reyes
Co-authors: Hon. Elvis L.Bedia
WHEREAS, Article II, Section 15 of the 1987 Constitution provides that the State shall protect health.
Page 1 of 5
"""

SCANNED_BARANGAY_RESOLUTION = """BARANGAY PLATERO
SIPISAKATITIKANNGPAGPUPULONGNGSANGGUNIANGBARANGAY NOONGIKA-7NGENEROTAONG2022.
KAPASYAHANBLG.4-2022
Kapasyahan sapagamyenda ngOrdinansang Pang Lungsod
Sapagkat; Sa napakaraming nagaganap na kaguluhan.
"""


class ParseFieldsTests(TestCase):
    def test_city_ordinance(self):
        fields = parse_fields(SCANNED_CITY_ORDINANCE)
        self.assertEqual(fields["number"], "No. 31-(2025)")
        self.assertEqual(fields["date_approved"], "2025-11-17")
        self.assertEqual(fields["author"], "Hon. Jonalina R. Reyes")
        self.assertEqual(fields["category"], "Health")
        self.assertTrue(fields["title"].startswith("An Ordinance Institutionalizing the Polycystic"))
        self.assertIn("(PCOS)", fields["title"])
        # Title stops at the author line; description starts at the first WHEREAS.
        self.assertNotIn("Authored", fields["title"])
        self.assertTrue(fields["description"].startswith("WHEREAS"))
        self.assertNotIn("Page 1", fields["description"])

    def test_tagalog_barangay_resolution(self):
        fields = parse_fields(SCANNED_BARANGAY_RESOLUTION)
        self.assertEqual(fields["date_approved"], "2022-01-07")
        self.assertTrue(fields["title"].startswith("Kapasyahan sapagamyenda"))

    def test_unreadable_text_gives_blank_fields(self):
        fields = parse_fields("~~ smudge ~~\n\n")
        self.assertEqual(set(fields.values()), {""})

    def test_impossible_date_is_ignored(self):
        self.assertEqual(parse_fields("dated November 45, 2025")["date_approved"], "")


def _text_layer_pdf(text):
    """A one-page PDF with a real text layer, so extraction skips OCR (fast, no model load)."""
    document = pymupdf.open()
    page = document.new_page()
    page.insert_textbox(pymupdf.Rect(40, 40, 550, 800), text, fontsize=10)
    data = document.tobytes()
    document.close()
    return data


class OrdinanceExtractEndpointTests(APITestCase):
    def setUp(self):
        self.secretary = User.objects.create_user(
            username="sec3", email="sec3@test.com", password="x", role=User.Role.STAFF, position="Secretary"
        )
        self.captain = User.objects.create_user(
            username="cap3", email="cap3@test.com", password="x", role=User.Role.STAFF, position="Barangay Captain"
        )
        self.url = "/api/ordinances/extract/"

    def _upload(self, data, name="scan.pdf"):
        return self.client.post(
            self.url, {"pdf_file": SimpleUploadedFile(name, data, content_type="application/pdf")}, format="multipart"
        )

    def test_secretary_gets_prefill_fields(self):
        self.client.force_authenticate(self.secretary)
        response = self._upload(_text_layer_pdf(SCANNED_CITY_ORDINANCE))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["number"], "No. 31-(2025)")
        self.assertEqual(response.data["date_approved"], "2025-11-17")

    def test_does_not_save_an_ordinance(self):
        self.client.force_authenticate(self.secretary)
        self._upload(_text_layer_pdf(SCANNED_CITY_ORDINANCE))
        self.assertEqual(Ordinance.objects.count(), 0)

    def test_captain_is_forbidden(self):
        self.client.force_authenticate(self.captain)
        self.assertEqual(self._upload(_text_layer_pdf(SCANNED_CITY_ORDINANCE)).status_code, 403)

    def test_anonymous_is_rejected(self):
        self.assertIn(self._upload(_text_layer_pdf(SCANNED_CITY_ORDINANCE)).status_code, (401, 403))

    def test_missing_file_is_400(self):
        self.client.force_authenticate(self.secretary)
        self.assertEqual(self.client.post(self.url, {}, format="multipart").status_code, 400)

    def test_corrupt_pdf_is_422_not_a_crash(self):
        self.client.force_authenticate(self.secretary)
        self.assertEqual(self._upload(b"this is not a pdf").status_code, 422)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class OrdinanceExtractThrottleTests(APITestCase):
    """Each OCR call costs several hundred MB of RAM, so it's capped per user."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.secretary = User.objects.create_user(
            username="sec4", email="sec4@test.com", password="x", role=User.Role.STAFF, position="Secretary"
        )
        self.client.force_authenticate(self.secretary)

    def _upload(self):
        return self.client.post(
            "/api/ordinances/extract/",
            {"pdf_file": SimpleUploadedFile("scan.pdf", b"not a pdf", content_type="application/pdf")},
            format="multipart",
        )

    def test_extract_is_limited_per_user(self):
        for _ in range(5):
            self.assertEqual(self._upload().status_code, 422)  # corrupt PDF: fails fast, still counts
        self.assertEqual(self._upload().status_code, 429)
