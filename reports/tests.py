from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from orms_backend.codes import MAX_CODE_ATTEMPTS

from .models import Report, ReportVerificationCode

REAL_CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


class ReportVerificationCodeTests(APITestCase):
    """The report-filing identity code has the same 1,000,000-guess weakness as Forgot Password."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="juan", email="juan@test.com", password="x", is_verified=True
        )
        self.client.force_authenticate(self.user)

    def _send(self):
        return self.client.post("/api/reports/send-verification/")

    def _verify(self, code):
        return self.client.post("/api/reports/verify-code/", {"code": code}, format="json")

    def _live_codes(self):
        return [c for c in ReportVerificationCode.objects.filter(user=self.user) if c.is_valid()]

    def _wrong(self, code):
        return "000000" if code != "000000" else "111111"

    def test_correct_code_verifies(self):
        self._send()
        code = self._live_codes()[0].code
        self.assertRegex(code, r"^\d{6}$")
        self.assertEqual(self._verify(code).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_sending_again_kills_the_earlier_code(self):
        self._send()
        first = self._live_codes()[0].code
        self._send()
        # Only one live code at a time — stacking them would multiply an attacker's odds per guess.
        self.assertEqual(len(self._live_codes()), 1)
        newest = self._live_codes()[0].code
        if newest != first:
            self.assertEqual(self._verify(first).status_code, 400)
        self.assertEqual(self._verify(newest).status_code, 200)

    def test_code_dies_after_too_many_wrong_guesses(self):
        self._send()
        code = self._live_codes()[0].code
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            self.assertEqual(self._verify(self._wrong(code)).status_code, 400)
        last = self._verify(self._wrong(code))
        self.assertIn("Too many incorrect attempts", str(last.data))
        self.assertEqual(self._verify(code).status_code, 400)

    def test_correct_code_works_after_a_few_wrong_guesses(self):
        self._send()
        code = self._live_codes()[0].code
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            self._verify(self._wrong(code))
        self.assertEqual(self._verify(code).status_code, 200)

    def test_verifying_with_no_code_requested_fails_cleanly(self):
        self.assertEqual(self._verify("123456").status_code, 400)


@override_settings(CACHES=REAL_CACHE)
class ReportVerificationThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = User.objects.create_user(username="juan", email="juan@test.com", password="x", is_verified=True)
        self.client.force_authenticate(self.user)

    def test_sending_codes_is_limited(self):
        for _ in range(3):
            self.assertEqual(self.client.post("/api/reports/send-verification/").status_code, 200)
        self.assertEqual(self.client.post("/api/reports/send-verification/").status_code, 429)

    def test_verify_attempts_are_limited(self):
        for _ in range(5):
            self.assertEqual(self.client.post("/api/reports/verify-code/", {"code": "000000"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/reports/verify-code/", {"code": "000000"}, format="json").status_code, 429)

    def test_limit_is_per_user(self):
        for _ in range(3):
            self.client.post("/api/reports/send-verification/")
        other = User.objects.create_user(username="maria", email="maria@test.com", password="x", is_verified=True)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post("/api/reports/send-verification/").status_code, 200)


class ReportStatusClaimGateTests(APITestCase):
    """An Investigator can only work (status/remarks) a report they've claimed themselves."""

    def setUp(self):
        self.citizen = User.objects.create_user(username="cit", email="cit@test.com", password="x", is_verified=True)
        self.investigator = User.objects.create_user(
            username="inv1", email="inv1@test.com", password="x", role=User.Role.STAFF, position="Investigator"
        )
        self.other_investigator = User.objects.create_user(
            username="inv2", email="inv2@test.com", password="x", role=User.Role.STAFF, position="Investigator"
        )
        self.admin = User.objects.create_user(username="adm", email="adm@test.com", password="x", role=User.Role.ADMIN)
        self.report = Report.objects.create(
            citizen=self.citizen, location="Purok 1", ordinance="Anti-Littering", incident_date="2026-09-01",
            nature_of_violation="Dumping garbage",
        )
        self.url = f"/api/reports/staff/{self.report.id}/"

    def _patch(self, **body):
        return self.client.patch(self.url, body or {"status": "under_review"}, format="json")

    def test_unclaimed_report_cannot_be_updated(self):
        self.client.force_authenticate(self.investigator)
        response = self._patch(status="under_review")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Claim this report", response.data["detail"])
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, Report.Status.SUBMITTED)

    def test_report_claimed_by_someone_else_cannot_be_updated(self):
        self.report.assigned_investigator = self.other_investigator
        self.report.save()
        self.client.force_authenticate(self.investigator)
        response = self._patch(status="under_review")
        self.assertEqual(response.status_code, 403)
        self.assertIn("inv2", response.data["detail"])
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, Report.Status.SUBMITTED)

    def test_remarks_only_edit_is_also_blocked_without_the_claim(self):
        self.client.force_authenticate(self.investigator)
        self.assertEqual(self._patch(remarks="Looking into it").status_code, 403)
        self.report.refresh_from_db()
        self.assertEqual(self.report.remarks, "")

    def test_claiming_it_first_lets_the_investigator_update_it(self):
        self.client.force_authenticate(self.investigator)
        self.assertEqual(self.client.post(f"{self.url}claim/").status_code, 200)
        response = self._patch(status="under_review", remarks="On it")
        self.assertEqual(response.status_code, 200)
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, Report.Status.UNDER_REVIEW)
        self.assertEqual(self.report.remarks, "On it")

    def test_forfeiting_takes_the_ability_to_update_away_again(self):
        self.client.force_authenticate(self.investigator)
        self.client.post(f"{self.url}claim/")
        self.client.post(f"{self.url}forfeit/")
        self.assertEqual(self._patch(status="in_action").status_code, 403)

    def test_second_investigator_cannot_update_after_the_first_claims_it(self):
        self.client.force_authenticate(self.investigator)
        self.client.post(f"{self.url}claim/")
        self.client.force_authenticate(self.other_investigator)
        self.assertEqual(self._patch(status="resolved").status_code, 403)
        self.report.refresh_from_db()
        self.assertNotEqual(self.report.status, Report.Status.RESOLVED)

    def test_admin_can_still_update_on_someones_behalf(self):
        self.report.assigned_investigator = self.other_investigator
        self.report.save()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._patch(status="under_review").status_code, 200)

    def test_non_investigator_staff_are_still_refused_outright(self):
        secretary = User.objects.create_user(
            username="sec", email="sec@test.com", password="x", role=User.Role.STAFF, position="Secretary"
        )
        self.client.force_authenticate(secretary)
        self.assertEqual(self._patch(status="under_review").status_code, 403)
