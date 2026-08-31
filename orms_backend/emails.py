"""
O.R.M.S. — transactional email sending, shared by accounts/ and reports/.

Every "why the system sends an email" case goes through send_templated_email()
below:

  Citizen gets emailed when...
    - they request a password reset (a 6-digit code)
    - their account is approved
    - their report is submitted (a confirmation)
    - their suggestion is submitted (a confirmation)
    - their report reaches a final verdict (Resolved — remarks included if any)
    - their account is rejected (with the admin's reason, and another chance
      to sign up again with the same email)
  Staff gets emailed when...
    - a report is submitted (needs review)
    - a suggestion is submitted (needs review)
  Admin gets emailed when...
    - a citizen self-registers (a new account is pending approval)

Each has its own small html template under <app>/templates/emails/,
extending emails/_base.html (accounts/templates/emails/_base.html — shared
across apps via Django's merged app-template namespace, so reports' templates
can extend it too without duplicating it).

Uses Brevo's SMTP relay (see settings.py) through Django's normal mail
framework, so sending is just EmailMultiAlternatives.send() underneath —
swapping providers later is a settings change, not a rewrite.

Sending is best-effort: a failure here (bad credentials, provider outage,
etc.) is logged and swallowed rather than raised, so the action that
triggered it — filing a report, approving an account — still succeeds even
if the notification email doesn't go out.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


def send_templated_email(*, to, subject, template_name, context):
    if not to:
        return
    html_body = render_to_string(f"emails/{template_name}.html", context)
    text_body = strip_tags(html_body)
    try:
        message = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, [to])
        message.attach_alternative(html_body, "text/html")
        message.send()
    except Exception:
        logger.exception("Failed to send %r email to %s", template_name, to)


def _send_to_each(users, **kwargs):
    for user in users:
        send_templated_email(to=user.email, **kwargs)


# ---- Citizen ----------------------------------------------------------


def send_password_reset_email(user, code, expires_minutes):
    send_templated_email(
        to=user.email,
        subject="O.R.M.S. — Your password reset code",
        template_name="password_reset_code",
        context={"user": user, "code": code, "expires_minutes": expires_minutes},
    )


def send_account_approved_email(user):
    send_templated_email(
        to=user.email,
        subject="O.R.M.S. — Your account has been approved",
        template_name="account_approved",
        context={"user": user},
    )


def send_account_rejected_email(name, email, reason):
    send_templated_email(
        to=email,
        subject="O.R.M.S. — Update on your account sign-up",
        template_name="account_rejected",
        context={"name": name, "reason": reason},
    )


def send_report_submitted_citizen_email(report):
    send_templated_email(
        to=report.citizen.email,
        subject="O.R.M.S. — Your report has been submitted",
        template_name="report_submitted_citizen",
        context={"report": report},
    )


def send_suggestion_submitted_citizen_email(concern):
    send_templated_email(
        to=concern.citizen.email,
        subject="O.R.M.S. — Your suggestion has been submitted",
        template_name="suggestion_submitted_citizen",
        context={"concern": concern},
    )


def send_report_resolved_email(report):
    # Final Verdict, in status-timeline terms — the last of the 4 stages.
    # Includes remarks in the body when there are any, rather than a
    # separate email.
    send_templated_email(
        to=report.citizen.email,
        subject="O.R.M.S. — Your report has reached a final verdict",
        template_name="report_resolved",
        context={"report": report},
    )


# ---- Staff --------------------------------------------------------------


def send_report_submitted_staff_emails(report, staff_users):
    _send_to_each(
        staff_users,
        subject="O.R.M.S. — A new report needs review",
        template_name="report_submitted_staff",
        context={"report": report},
    )


def send_suggestion_submitted_staff_emails(concern, staff_users):
    _send_to_each(
        staff_users,
        subject="O.R.M.S. — A new suggestion needs review",
        template_name="suggestion_submitted_staff",
        context={"concern": concern},
    )


# ---- Admin ----------------------------------------------------------------


def send_account_created_admin_emails(user, admin_users):
    _send_to_each(
        admin_users,
        subject="O.R.M.S. — A new account is pending approval",
        template_name="account_created_admin",
        context={"user": user},
    )
