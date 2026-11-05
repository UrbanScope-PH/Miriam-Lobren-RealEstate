"""Email one-time-code storage and delivery for registration and password recovery."""

import hashlib
import hmac
import json
import os
import secrets
import smtplib
import time
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from backend.database import get_db_connection
from backend.auth import _parse_env_file

# Ensure local .env is parsed if not already populated in os.environ
for _k, _v in _parse_env_file().items():
    if _v and _k not in os.environ:
        os.environ[_k] = _v

OTP_TTL_SECONDS = 10 * 60
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_REQUESTS_PER_HOUR = 10


def get_otp_secret() -> str:
    """Return the private OTP HMAC secret or raise when auth email is not configured."""
    secret = os.environ.get("AUTH_OTP_SECRET", "").strip()
    if len(secret) < 32:
        raise RuntimeError("AUTH_OTP_SECRET must contain at least 32 characters.")
    return secret


def create_otp() -> str:
    """Generate a six-digit code, preserving leading zeroes."""
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_digest(email: str, purpose: str, code: str) -> str:
    """HMAC the code so database contents cannot be used to recover live OTPs."""
    message = f"{purpose}:{email.strip().lower()}:{code}".encode("utf-8")
    return hmac.new(get_otp_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


def ip_digest(ip_address: str) -> str:
    """Store a keyed hash of the requester IP for a modest per-IP send limit."""
    message = (ip_address or "unknown").encode("utf-8")
    return hmac.new(get_otp_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


def issue_local_challenge(email: str, purpose: str, code_hash: str, ip_hash: str) -> bool:
    """Atomically enforce resend/IP limits and replace the active challenge."""
    now = int(time.time())
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM auth_email_challenge_requests WHERE created_at < ?", (now - 24 * 60 * 60,))
        sent_recently = conn.execute(
            "SELECT COUNT(*) FROM auth_email_challenge_requests WHERE ip_hash = ? AND created_at > ?",
            (ip_hash, now - 60 * 60)
        ).fetchone()[0]
        if sent_recently >= OTP_MAX_REQUESTS_PER_HOUR:
            conn.rollback()
            return False

        previous = conn.execute(
            "SELECT created_at FROM auth_email_challenges WHERE email = ? AND purpose = ?",
            (email, purpose)
        ).fetchone()
        if previous and int(previous[0]) > now - OTP_RESEND_SECONDS:
            conn.rollback()
            return False

        conn.execute(
            "INSERT INTO auth_email_challenge_requests (ip_hash, created_at) VALUES (?, ?)",
            (ip_hash, now)
        )
        conn.execute(
            """INSERT INTO auth_email_challenges (email, purpose, code_hash, expires_at, attempts, created_at)
               VALUES (?, ?, ?, ?, 0, ?)
               ON CONFLICT(email, purpose) DO UPDATE SET
                 code_hash = excluded.code_hash,
                 expires_at = excluded.expires_at,
                 attempts = 0,
                 created_at = excluded.created_at""",
            (email, purpose, code_hash, now + OTP_TTL_SECONDS, now)
        )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def consume_local_challenge(email: str, purpose: str, supplied_hash: str) -> bool:
    """Consume a valid challenge once, incrementing attempts on an invalid code."""
    now = int(time.time())
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT code_hash, expires_at, attempts FROM auth_email_challenges WHERE email = ? AND purpose = ?",
            (email, purpose)
        ).fetchone()
        if not row:
            conn.rollback()
            return False
        if int(row["expires_at"]) <= now or int(row["attempts"]) >= OTP_MAX_ATTEMPTS:
            conn.execute("DELETE FROM auth_email_challenges WHERE email = ? AND purpose = ?", (email, purpose))
            conn.commit()
            return False
        if hmac.compare_digest(str(row["code_hash"]), supplied_hash):
            conn.execute("DELETE FROM auth_email_challenges WHERE email = ? AND purpose = ?", (email, purpose))
            conn.commit()
            return True
        conn.execute(
            "UPDATE auth_email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = ?",
            (email, purpose)
        )
        conn.commit()
        return False
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def clear_local_challenge(email: str, purpose: str) -> None:
    """Remove a challenge if delivery fails."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM auth_email_challenges WHERE email = ? AND purpose = ?", (email, purpose))
        conn.commit()
    finally:
        conn.close()


def get_valid_from_sender(sender: str) -> str:
    s = (sender or "").strip().strip("\"'")
    if not s:
        return "UrbanScope <onboarding@resend.dev>"
    if "<" in s and ">" in s and "@" in s:
        return s
    if "@" in s and "<" not in s:
        return f"UrbanScope <{s}>"
    return f"{s} <onboarding@resend.dev>"


def send_otp_email(email: str, purpose: str, code: str) -> None:
    """Send an OTP using Gmail SMTP or Resend API."""
    is_registration = purpose == "register"
    subject = "Verify your UrbanScope email" if is_registration else "Your UrbanScope password reset code"
    action = "verify your email address" if is_registration else "reset your password"
    text_content = f"Your UrbanScope code to {action} is {code}. It expires in 10 minutes. If you did not request this, ignore this email."
    html_content = (
        "<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a\">"
        "<h2>UrbanScope</h2>"
        f"<p>Use this code to {action}:</p>"
        f"<p style=\"font-size:32px;font-weight:700;letter-spacing:8px;color:#245b37\">{code}</p>"
        "<p>This code expires in 10 minutes and can be used once.</p>"
        "<p>If you did not request this, you can ignore this email.</p></div>"
    )

    # 1. Prioritize Gmail SMTP if configured (sends to ANY email address free)
    smtp_user = os.environ.get("SMTP_USER", "").strip() or "gianticaya@gmail.com"
    smtp_pass = os.environ.get("SMTP_PASS", "").strip().replace(" ", "") or "gtszlggkmcvvkpsz"
    if smtp_user and smtp_pass:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"UrbanScope <{smtp_user}>"
        msg["To"] = email
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, email, msg.as_string())
        except Exception:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, email, msg.as_string())
        return

    # 2. Fallback to Resend
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = get_valid_from_sender(os.environ.get("RESEND_FROM_EMAIL", ""))
    if not api_key:
        raise RuntimeError("SMTP_USER/SMTP_PASS or RESEND_API_KEY is required to send authentication email.")

    payload = json.dumps({
        "from": sender,
        "to": [email],
        "subject": subject,
        "text": text_content,
        "html": html_content
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError("The email provider did not accept the message.")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("The email provider could not be reached.") from exc

