"""
O.R.M.S. — transactional email sending, shared by accounts/ and reports/.

Every "why the system sends an email" case (per the scope doc) goes through
send_templated_email() below: forgotten password, account approved, account
rejected (with a reason + another chance to sign up), a report resolved, a
report getting remarks. Each has its own small html template under
<app>/templates/emails/, extending emails/_base.html (accounts/templates/
emails/_base.html — shared across apps via Django's merged app-template
namespace, so reports' templates can extend it too without duplicating it).

Sending is best-effort: a failure here (bad credentials, provider outage,
etc.) is logged and swallowed rather than raised, so the action that
triggered it — approving an account, resolving a report — still succeeds
even if the notification email doesn't go out.
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


def send_report_resolved_email(report):
    send_templated_email(
        to=report.citizen.email,
        subject="O.R.M.S. — Your report has been resolved",
        template_name="report_resolved",
        context={"report": report},
    )


def send_report_remarks_email(report):
    send_templated_email(
        to=report.citizen.email,
        subject="O.R.M.S. — New remarks on your report",
        template_name="report_remarks",
        context={"report": report},
    )
