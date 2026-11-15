"""Email dispatch module for CoRoomies.

Durability Notice:
When dispatched via FastAPI `BackgroundTasks`, email jobs execute in-process on
the application worker thread pool. In-process background tasks are not durable
across process crashes, container restarts, or unexpected terminations. For
mission-critical high-throughput architectures requiring delivery guarantees
across server restarts, an external persistent task queue (e.g. Celery / SQS)
or direct transactional email API is recommended.
"""

import logging
import os
import smtplib
import time
from email.mime.text import MIMEText

from app.config import DEV_MODE

logger = logging.getLogger("coroomies.email")


def smtp_configured() -> bool:
    return bool(
        os.getenv("SMTP_HOST")
        and os.getenv("SMTP_USER")
        and os.getenv("SMTP_PASS")
    )


def _send(to_email: str, subject: str, body: str, max_retries: int = 2) -> bool:
    """Send an email via SMTP with bounded retries and timeout.
    
    Returns True if sent successfully, False otherwise.
    Never exposes or logs credentials, passwords, or message secrets.
    """
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASS") or ""

    if not host or not user or not password:
        return False

    try:
        port = int((os.getenv("SMTP_PORT") or "587").strip())
    except ValueError:
        logger.warning("SMTP_PORT is invalid; email delivery is disabled")
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to_email

    for attempt in range(1, max_retries + 1):
        try:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                server.login(user, password)
                server.send_message(msg)
            return True
        except Exception as exc:
            logger.warning(
                "SMTP delivery attempt %d/%d to %s failed (%s)",
                attempt,
                max_retries,
                to_email,
                type(exc).__name__,
            )
            if attempt < max_retries:
                time.sleep(1.0)

    return False


def send_otp_email(to_email: str, otp: str, ttl_minutes: int) -> bool:
    return _send(
        to_email,
        f"CoRoomies password reset code: {otp}",
        f"Your CoRoomies verification code is:\n\n"
        f"    {otp}\n\n"
        f"This code expires in {ttl_minutes} minutes.\n"
        f"If you didn't request a password reset, you can ignore this email.",
    )


def send_email_change_otp(to_email: str, code: str, ttl_minutes: int) -> bool:
    return _send(
        to_email,
        f"CoRoomies email change code: {code}",
        f"Your CoRoomies email-change verification code is:\n\n"
        f"    {code}\n\n"
        f"This code expires in {ttl_minutes} minutes.\n"
        f"If you didn't request this change, someone may be trying to "
        f"take over your account — contact support immediately.",
    )


def send_email_changed_notice(to_email: str) -> bool:
    return _send(
        to_email,
        "CoRoomies: your account email changed",
        "The email address on your CoRoomies account was just changed.\n"
        "If this wasn't you, please contact support immediately.",
    )


def send_otp_email_background(
    to_email: str, otp: str, ttl_minutes: int, user_id: int | None = None
) -> None:
    """Asynchronous background task worker for password reset OTP emails.
    
    Executed via FastAPI BackgroundTasks to prevent synchronous SMTP connection
    delays from blocking client HTTP request/response cycles.
    """
    sent = send_otp_email(to_email, otp, ttl_minutes)
    if not sent:
        if DEV_MODE:
            logger.warning(
                "SMTP delivery disabled or failed — dev-mode reset code for %s: %s",
                to_email,
                otp,
            )
        else:
            logger.error(
                "Password reset email delivery failed for user_id=%s (recipient=%s)",
                user_id,
                to_email,
            )


def send_email_change_otp_background(
    to_email: str, code: str, ttl_minutes: int, user_id: int | None = None
) -> None:
    """Asynchronous background task worker for email-change verification OTPs."""
    sent = send_email_change_otp(to_email, code, ttl_minutes)
    if not sent:
        if DEV_MODE:
            logger.warning(
                "SMTP delivery disabled or failed — dev-mode email-change code for %s: %s",
                to_email,
                code,
            )
        else:
            logger.error(
                "Email-change verification email delivery failed for user_id=%s (recipient=%s)",
                user_id,
                to_email,
            )


def send_email_changed_notice_background(to_email: str) -> None:
    """Asynchronous background task worker for email changed notification."""
    send_email_changed_notice(to_email)
