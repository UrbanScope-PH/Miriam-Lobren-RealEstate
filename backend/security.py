"""
UrbanScope - Shared FastAPI Security & Validation Utilities
=========================================================
Centralizes rate limiting, origin/CSRF checks, URL/image sanitization,
response filtering, and optional Turnstile bot verification.
"""

from __future__ import annotations

import hmac
import ipaddress
import os
import re
import secrets
import threading
import time
import urllib.parse
import urllib.request
import json
from typing import Any, Optional

from fastapi import Request, Response


# ==========================================================
# ENVIRONMENT & RUNTIME HELPERS
# ==========================================================

def is_production_mode() -> bool:
    env = (
        os.environ.get("URBANSCOPE_ENV")
        or os.environ.get("VERCEL_ENV")
        or os.environ.get("ENV")
        or ""
    ).strip().lower()
    return env in ("prod", "production")


def get_allowed_origins() -> list[str]:
    configured = [
        origin.strip().rstrip("/")
        for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    dev_defaults = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://[::1]:8000",
    ]
    if is_production_mode():
        return configured
    seen = set()
    merged: list[str] = []
    for item in dev_defaults + configured:
        if item not in seen:
            seen.add(item)
            merged.append(item)
    return merged


def is_transport_https(request: Optional[Request]) -> bool:
    """Strictly check whether the inbound request scheme/proxy protocol is HTTPS."""
    if request is None:
        return False
    xfp = (request.headers.get("x-forwarded-proto") or "").strip().lower()
    if xfp:
        return "https" in xfp
    return (request.url.scheme or "").strip().lower() == "https"


def is_https_request(request: Optional[Request]) -> bool:
    """Determine whether Secure cookie attributes should be applied for this request."""
    if request is None:
        return is_production_mode()
    if is_transport_https(request):
        return True
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").lower().split(":")[0]
    if host in ("localhost", "127.0.0.1", "::1", "[::1]"):
        return False
    return is_production_mode()


def get_client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _clean_secret_value(raw: str, anon_key: str = "") -> str:
    val = (raw or "").strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1].strip()
    if not val or val == anon_key or val.startswith("sb_publishable_"):
        return ""
    return val


def get_supabase_service_key(anon_key: str = "") -> str:
    """Resolve the Supabase privileged server key across supported env var names, rejecting publishable keys."""
    preferred = (
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_SERVICE_ROLE",
        "STORAGE_SUPABASE_SERVICE_ROLE_KEY",
        "STORAGE_SUPABASE_SECRET_KEY",
        "STORAGE_SUPABASE_SERVICE_KEY",
    )
    for env_name in preferred:
        val = _clean_secret_value(os.environ.get(env_name, ""), anon_key)
        if val:
            return val

    dynamic_names = sorted(
        name for name in os.environ
        if re.fullmatch(r"(?:[A-Z0-9_]+_)?SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|SERVICE_KEY|SERVICE_ROLE)", name, re.IGNORECASE)
        and not re.search(r"(?:^|_)(?:PUBLIC|ANON|PUBLISHABLE)(?:_|$)", name, re.IGNORECASE)
    )
    for env_name in dynamic_names:
        val = _clean_secret_value(os.environ.get(env_name, ""), anon_key)
        if val:
            return val
    return ""


# ==========================================================
# RATE LIMITER (SLIDING WINDOW WITH OPTIONAL SQLITE PERSISTENCE)
# ==========================================================

_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, dict[str, float | int]] = {}


def check_rate_limit(
    bucket_key: str,
    limit: int = 10,
    window_seconds: int = 60,
    block_seconds: int = 300,
) -> bool:
    """Thread-safe fixed-window rate limiter with temporary cooldown block."""
    now = time.time()
    clean_key = (bucket_key or "")[:240]
    if not clean_key:
        return True
    with _RATE_LOCK:
        entry = _RATE_BUCKETS.get(clean_key)
        if not entry:
            _RATE_BUCKETS[clean_key] = {
                "count": 1,
                "window_start": now,
                "blocked_until": 0.0,
            }
            return True

        if float(entry["blocked_until"]) > now:
            return False

        if now - float(entry["window_start"]) >= max(window_seconds, 1):
            entry["count"] = 1
            entry["window_start"] = now
            entry["blocked_until"] = 0.0
            return True

        entry["count"] = int(entry["count"]) + 1
        if int(entry["count"]) > max(limit, 1):
            entry["blocked_until"] = now + max(block_seconds, window_seconds)
            return False
        return True


def reset_rate_limits_for_tests() -> None:
    """Clear in-memory rate-limit counters (used exclusively during automated test runs)."""
    with _RATE_LOCK:
        _RATE_BUCKETS.clear()


# ==========================================================
# ORIGIN & CSRF HELPERS
# ==========================================================

CSRF_COOKIE_NAME = "urbanscope_csrf"


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(24)


def is_same_origin_request(request: Request) -> bool:
    """Strictly verify same-origin requests via Sec-Fetch-Site, Origin, or Referer."""
    sec_fetch = (request.headers.get("sec-fetch-site") or "").strip().lower()
    if sec_fetch == "cross-site":
        return False

    req_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip().lower()
    allowed_hosts = {req_host} if req_host else set()
    for allowed_origin in get_allowed_origins():
        try:
            parsed = urllib.parse.urlparse(allowed_origin)
            if parsed.netloc:
                allowed_hosts.add(parsed.netloc.lower())
        except Exception:
            pass

    def _host_ok(url_str: str) -> bool:
        try:
            parsed = urllib.parse.urlparse(url_str)
            host = (parsed.netloc or "").lower()
            if not host:
                return False
            if host in allowed_hosts:
                return True
            if not is_production_mode():
                hostname = (parsed.hostname or "").lower()
                if hostname in ("localhost", "127.0.0.1", "::1"):
                    return True
                try:
                    ip = ipaddress.ip_address(hostname)
                    if ip.is_loopback or ip.is_private:
                        return True
                except ValueError:
                    pass
            return False
        except Exception:
            return False

    origin = request.headers.get("origin")
    if origin:
        if origin.lower() == "null":
            return False
        return _host_ok(origin)

    referer = request.headers.get("referer")
    if referer:
        return _host_ok(referer)

    if is_production_mode():
        return sec_fetch == "same-origin"
    return True


def verify_csrf_protection(request: Request) -> bool:
    """
    Validate same-origin and double-submit CSRF cookie on state-changing routes
    authenticated via HTTP cookies (rather than explicit Bearer token header).
    """
    if not is_same_origin_request(request):
        return False

    has_auth_cookie = bool(request.cookies.get("access_token") or request.cookies.get("urbanscope_user_session"))
    auth_header = (request.headers.get("authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        # Explicit Bearer header cannot be sent automatically by CSRF form submission
        return True

    if not has_auth_cookie:
        return True

    cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME) or ""
    header_csrf = request.headers.get("x-csrf-token") or ""
    if not cookie_csrf or not header_csrf:
        return False
    return hmac.compare_digest(cookie_csrf.encode("utf-8"), header_csrf.encode("utf-8"))


# ==========================================================
# BOT PROTECTION (HONEYPOT / TIMING / OPTIONAL TURNSTILE)
# ==========================================================

def verify_bot_defense(
    request: Optional[Request],
    honeypot_val: Optional[str] = None,
    form_rendered_ms: Optional[float] = None,
    turnstile_token: Optional[str] = None,
) -> tuple[bool, str]:
    if honeypot_val and str(honeypot_val).strip():
        return False, "Request rejected by spam filter."

    if form_rendered_ms is not None:
        try:
            rendered = float(form_rendered_ms)
            if rendered > 0:
                elapsed_ms = (time.time() * 1000.0) - rendered
                if 0 <= elapsed_ms < 450:
                    return False, "Form submitted too quickly. Please try again."
        except (TypeError, ValueError):
            pass

    turnstile_secret = os.environ.get("TURNSTILE_SECRET_KEY", "").strip()
    if turnstile_secret:
        token = (turnstile_token or "").strip()
        if not token:
            return False, "Please complete the human verification challenge."
        payload_data = {"secret": turnstile_secret, "response": token}
        ip = get_client_ip(request)
        if ip and ip != "unknown":
            payload_data["remoteip"] = ip
        encoded = urllib.parse.urlencode(payload_data).encode("utf-8")
        req = urllib.request.Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=encoded,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if not data.get("success"):
                    return False, "Human verification failed. Please retry."
        except Exception:
            return False, "Human verification service unavailable."

    return True, ""


# ==========================================================
# SANITIZATION & FILE UPLOAD VALIDATION
# ==========================================================

_IMAGE_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$", re.IGNORECASE)
_RELATIVE_ASSET_RE = re.compile(r"^assets/images/[A-Za-z0-9._/\-]+$")


def sanitize_image_url(
    raw_value: Optional[str],
    *,
    max_data_url_bytes: int = 3 * 1024 * 1024,
    default: str = "",
) -> str:
    """
    Accept ONLY relative `assets/images/...` paths, HTTPS URLs, or PNG/JPEG/WebP data URIs.
    Rejects SVG data URIs, javascript:, vbscript:, HTML URIs, and path traversal.
    """
    val = (raw_value or "").strip()
    if not val:
        return default
    if len(val) > max_data_url_bytes + 128:
        raise ValueError("Image payload exceeds maximum permitted size.")

    lower = val.lower()
    if re.match(r"^(javascript|vbscript|data:text/html|data:image/svg\+xml)", lower):
        raise ValueError("Unsupported or unsafe image format.")

    if lower.startswith("data:image/"):
        if not _IMAGE_DATA_URL_RE.match(val):
            raise ValueError("Only PNG, JPEG, and WebP images are permitted.")
        return val

    if lower.startswith("https://"):
        parsed = urllib.parse.urlparse(val)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("Invalid HTTPS image URL.")
        return val

    cleaned = re.sub(r"^(\.\./)+", "", val).lstrip("/")
    if ".." in cleaned or not _RELATIVE_ASSET_RE.match(cleaned):
        raise ValueError("Image must reference a valid PNG/JPEG/WebP file or asset path.")
    return cleaned


def escape_postgrest_filter_value(value: str) -> str:
    """Strip PostgREST filter operators from strings interpolated into `.or=(...)` filters."""
    return re.sub(r"[(),\\*]", "", str(value or "")).strip()


def sanitize_user_dict(user: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Strip sensitive secrets/hashes from user dictionaries before API serialization."""
    if not user:
        return None
    clean = dict(user)
    clean.pop("password_hash", None)
    clean.pop("google_id", None)
    if clean.get("bio") == "__URBANSCOPE_DELETED__":
        clean["bio"] = ""
    return clean


def set_csrf_cookie(response: Response, request: Request, token: Optional[str] = None) -> str:
    csrf_val = token or generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_val,
        httponly=False,
        samesite="lax",
        secure=is_https_request(request),
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return csrf_val
