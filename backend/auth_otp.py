"""Email one-time-code storage and delivery for registration and password recovery."""

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
import uuid
from typing import Dict, Optional

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
DEFAULT_RESEND_FROM_EMAIL = "UrbanScope <noreply@miriamlobren.site>"


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


def check_local_challenge(email: str, purpose: str, supplied_hash: str) -> bool:
    """Check a challenge validity without deleting it, incrementing attempts on an invalid code."""
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
        return DEFAULT_RESEND_FROM_EMAIL
    if "<" in s and ">" in s and "@" in s:
        return s
    if "@" in s and "<" not in s:
        return f"UrbanScope <{s}>"
    if "." in s and "@" not in s and " " not in s:
        return f"UrbanScope <noreply@{s}>"
    return f"{s} <noreply@miriamlobren.site>"


def get_valid_reply_to(raw_value: str) -> Optional[str]:
    """Return a clean Reply-To address when configured, else None."""
    cleaned = re.sub(r"[\r\n]+", " ", str(raw_value or "")).strip()
    if not cleaned:
        return None
    named_match = re.match(r"^([^<>]{1,100})<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>$", cleaned)
    if named_match:
        display_name = named_match.group(1).strip().strip("\"'")
        address = named_match.group(2).strip().lower()
        return f"{display_name} <{address}>" if display_name else address
    if re.match(r"^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$", cleaned):
        return cleaned.lower()
    return None


def wrap_email_html_document(title: str, body_html: str) -> str:
    """Wrap email body content in a standards-compliant HTML5 transactional layout."""
    safe_title = html.escape(title or "UrbanScope Notification")
    return "".join([
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta http-equiv="x-ua-compatible" content="ie=edge">',
        f"<title>{safe_title}</title>",
        "</head>",
        "<body style=\"margin:0;padding:24px 16px;background-color:#f6faf6;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#172b1d;line-height:1.55;\">",
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #d7e5dc;border-radius:12px;">',
        "<tr>",
        '<td style="padding:20px 24px 16px;border-bottom:1px solid #e6efe8;">',
        '<div style="font-size:20px;font-weight:700;color:#1e5c33;letter-spacing:-0.01em;">UrbanScope</div>',
        '<div style="font-size:12px;color:#4f6856;margin-top:2px;">Miriam Lobren Real Estate</div>',
        "</td>",
        "</tr>",
        "<tr>",
        f'<td style="padding:24px;font-size:15px;color:#20352a;">{body_html}</td>',
        "</tr>",
        "<tr>",
        '<td style="padding:16px 24px 20px;border-top:1px solid #e6efe8;background-color:#fbfdfb;font-size:12px;color:#5a7262;border-radius:0 0 12px 12px;">',
        "UrbanScope &middot; Miriam Lobren Real Estate &middot; Las Pi&ntilde;as City &amp; Cavite, Philippines<br>",
        '<a href="https://miriamlobren.site" style="color:#1e5c33;text-decoration:none;">https://miriamlobren.site</a><br>',
        "Automated transactional email sent in response to your account or inquiry activity.",
        "</td>",
        "</tr>",
        "</table>",
        "</body>",
        "</html>",
    ])


def send_email_message(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str,
    reply_to: str = "",
    headers: Optional[Dict[str, str]] = None,
) -> None:
    """Send an email using the Resend API."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is required to send email.")

    sender = get_valid_from_sender(os.environ.get("RESEND_FROM_EMAIL", "") or DEFAULT_RESEND_FROM_EMAIL)
    resolved_reply_to = get_valid_reply_to(reply_to or os.environ.get("RESEND_REPLY_TO", ""))
    merged_headers: Dict[str, str] = {"X-Entity-Ref-ID": str(uuid.uuid4())}
    if isinstance(headers, dict):
        merged_headers.update(headers)
    body_obj = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "text": text_content,
        "html": html_content,
        "headers": merged_headers,
    }
    if resolved_reply_to:
        body_obj["reply_to"] = resolved_reply_to
    payload = json.dumps(body_obj).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "UrbanScope/1.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError("The email provider did not accept the message.")
    except urllib.error.HTTPError as exc:
        err_body = ""
        try:
            err_raw = exc.read().decode("utf-8", errors="replace")
            err_json = json.loads(err_raw)
            err_body = str(err_json.get("message") or err_json.get("error") or err_raw).strip()
        except Exception:
            err_body = str(exc)
        raise RuntimeError(f"Resend delivery failed ({exc.code}): {err_body}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("The email provider could not be reached.") from exc


def send_otp_email(email: str, purpose: str, code: str) -> None:
    """Send an OTP using the Resend API."""
    is_registration = purpose == "register"
    action = "verify your email address" if is_registration else "reset your password"
    heading = "Email Verification Code" if is_registration else "Password Reset Code"
    subject = (
        f"Your UrbanScope verification code: {code}"
        if is_registration
        else f"Your UrbanScope password reset code: {code}"
    )
    safe_code = html.escape(code)
    text_content = "\n".join([
        "UrbanScope - Miriam Lobren Real Estate",
        "",
        f"Use this one-time security code to {action}:",
        "",
        f"{code}",
        "",
        "This verification code expires in 10 minutes and can only be used once.",
        "For your security, do not share this code with anyone.",
        "If you did not request this code, you can safely ignore this message.",
        "",
        "UrbanScope | Miriam Lobren Real Estate",
        "Las Pinas City & Cavite, Philippines | https://miriamlobren.site",
    ])
    body_html = (
        f'<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#172b1d;">{heading}</h1>'
        f'<p style="margin:0 0 14px;">Use this one-time security code to {action}:</p>'
        '<div style="margin:18px 0;padding:16px 20px;background-color:#f0f7f2;border:1px solid #cbe0d1;border-radius:10px;text-align:center;">'
        f'<span style="font-family:\'Courier New\',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e5c33;">{safe_code}</span>'
        "</div>"
        '<p style="margin:0 0 10px;font-size:14px;color:#2c4234;">This verification code expires in <strong>10 minutes</strong> and can only be used once.</p>'
        '<p style="margin:0;font-size:13px;color:#4f6856;">For your security, do not share this code with anyone. If you did not request this code, you can safely ignore this message.</p>'
    )
    html_content = wrap_email_html_document(subject, body_html)
    send_email_message(email, subject, text_content, html_content)

