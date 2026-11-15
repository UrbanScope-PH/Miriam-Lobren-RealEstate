"""
UrbanScope - Authentication, User Profile & Public Agent Profile Router
Handles registration, sign-in, Google OAuth 2.0, profile updates, and password changes.
"""

import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from backend.auth import (
    AUTHORIZED_ADMIN_EMAILS,
    AUTHORIZED_ADMIN_ROLES,
    AUTHORIZED_SUPERADMIN_EMAILS,
    create_access_token,
    get_current_user_from_request,
    get_google_client_id,
    hash_password,
    require_admin,
    require_user,
    verify_google_token,
    verify_password,
)
from backend.auth_otp import (
    check_local_challenge,
    clear_local_challenge,
    consume_local_challenge,
    create_otp,
    get_otp_secret,
    ip_digest,
    issue_local_challenge,
    otp_digest,
    send_otp_email,
)
from backend.database import determine_user_role, get_db_connection, row_to_dict
from backend.security import (
    CSRF_COOKIE_NAME,
    check_rate_limit,
    get_client_ip,
    get_supabase_service_key,
    is_https_request,
    is_same_origin_request,
    sanitize_image_url,
    sanitize_user_dict,
    set_csrf_cookie,
    verify_bot_defense,
)
from backend.models import (
    AdminProfileUpdate,
    AuthResponse,
    EmailOtpRegistrationComplete,
    EmailOtpStartRequest,
    GoogleAuthRequest,
    GoogleRegistrationComplete,
    OtpCodeCheckRequest,
    PasswordChangeRequest,
    PasswordResetComplete,
    PasswordResetRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter()

SUPABASE_URL = "https://vfspjuqymfbagesjxjmc.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_96sfQ4F18ypajf6bitBRqg_JtWTL4__"
OTP_GENERIC_REGISTER_MESSAGE = "If registration can proceed, a verification code has been sent to that email address."
OTP_GENERIC_RESET_MESSAGE = "If an account can be recovered with that email, a verification code has been sent."


def _supabase_service_role_key() -> str:
    return get_supabase_service_key(SUPABASE_ANON_KEY)


def _supabase_api_key() -> str:
    return _supabase_service_role_key()


def _email_is_valid(email: str) -> bool:
    return len(email) <= 254 and bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email))


def _require_otp_configuration() -> None:
    try:
        get_otp_secret()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not os.environ.get("RESEND_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="Email verification is not configured on the server.")


def _request_origin_allowed(request: Request) -> bool:
    return is_same_origin_request(request)


def _set_auth_cookies(response: Response, request: Request, token: str) -> None:
    secure_cookie = is_https_request(request)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/",
    )
    existing_csrf = (request.cookies.get(CSRF_COOKIE_NAME) or "").strip() or None
    set_csrf_cookie(response, request, existing_csrf)


def _enforce_bot_and_rate(
    request: Request,
    bucket: str,
    *,
    email: str = "",
    limit: int = 10,
    window_seconds: int = 300,
    block_seconds: int = 600,
    payload: Optional[object] = None,
    check_bot: bool = True,
) -> None:
    ip = get_client_ip(request)
    if not check_rate_limit(f"{bucket}:ip:{ip}", limit=limit, window_seconds=window_seconds, block_seconds=block_seconds):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes and try again.")
    if email:
        if not check_rate_limit(
            f"{bucket}:acct:{email.strip().lower()}",
            limit=max(limit, 8),
            window_seconds=window_seconds,
            block_seconds=block_seconds,
        ):
            raise HTTPException(status_code=429, detail="Too many attempts for this email. Please try again later.")
    if check_bot and payload is not None:
        honeypot = (
            getattr(payload, "company_website", None)
            or getattr(payload, "website", None)
            or getattr(payload, "hp", None)
        )
        rendered_ms = getattr(payload, "form_rendered_ms", None)
        if rendered_ms is None:
            rendered_ms = getattr(payload, "ft", None)
        turnstile = getattr(payload, "turnstile_token", None)
        ok, msg = verify_bot_defense(
            request,
            honeypot_val=honeypot,
            form_rendered_ms=rendered_ms,
            turnstile_token=turnstile,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=msg or "Submission blocked by anti-spam verification.")


def _cloud_user_by_email(email: str) -> Optional[dict]:
    """Look up the cloud account with server credentials when available."""
    if _is_cloud_sync_disabled():
        return None
    key = _supabase_service_role_key()
    if not key:
        return None
    try:
        encoded = urllib.parse.quote(email.strip().lower(), safe="")
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{encoded}&select=id,email,password_hash,role,full_name,phone,bio"
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        return rows[0] if isinstance(rows, list) and rows else None
    except Exception:
        return None


def _verified_cloud_password_update(email: str, password_hash: str) -> bool:
    """Update a cloud password after OTP proof; service credentials can set verification state."""
    if _is_cloud_sync_disabled():
        return False
    key = _supabase_service_role_key()
    if not key:
        return False
    try:
        encoded = urllib.parse.quote(email, safe="")
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{encoded}"
        body = json.dumps({
            "password_hash": password_hash,
            "email_verified_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }, method="PATCH")
        with urllib.request.urlopen(req, timeout=4) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        return bool(rows)
    except Exception:
        return False


def _issue_otp_for_local_request(email: str, purpose: str, request: Request) -> bool:
    code = create_otp()
    digest = otp_digest(email, purpose, code)
    ip_address = get_client_ip(request)
    if not issue_local_challenge(email, purpose, digest, ip_digest(ip_address)):
        return False
    try:
        send_otp_email(email, purpose, code)
        return True
    except Exception:
        return False


def _is_cloud_sync_disabled() -> bool:
    return os.environ.get("URBANSCOPE_DISABLE_CLOUD_SYNC") == "1"


def normalize_db_role(role: Optional[str], email: str = "") -> str:
    """Normalizes role values (e.g. Supabase 'client' -> SQLite 'user') to match SQLite CHECK constraints."""
    clean_email = (email or "").strip().lower()
    if clean_email == "urbanscope.cvsu@gmail.com":
        return "superadmin"
    clean_role = (role or "").strip().lower()
    if clean_role == "superadmin":
        return "superadmin"
    if clean_role in ("admin", "agent") or clean_email == "admin.realestate@gmail.com":
        return "admin"
    return "user"


def sync_password_to_supabase(email: str, password_hash: str) -> bool:
    """Synchronizes updated PBKDF2 password hash to Supabase Cloud so all devices & phones stay in sync."""
    key = _supabase_service_role_key()
    if _is_cloud_sync_disabled() or not key:
        return False
    try:
        clean_email = email.strip().lower()
        encoded_email = urllib.parse.quote(clean_email, safe="")
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{encoded_email}"
        body = json.dumps({
            "password_hash": password_hash,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            if res and len(res) > 0:
                return True

        # If user did not exist in Supabase yet, insert it
        create_url = f"{SUPABASE_URL}/rest/v1/users"
        create_body = json.dumps({
            "email": clean_email,
            "password_hash": password_hash,
            "full_name": "Miriam Lobren",
            "role": "admin" if clean_email != "urbanscope.cvsu@gmail.com" else "superadmin",
            "avatar_url": "assets/images/agent.jpg",
            "email_verified_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req_post = urllib.request.Request(
            create_url,
            data=create_body,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req_post, timeout=4) as resp:
            return True
    except Exception:
        return False


def sync_new_user_to_supabase(user_dict: dict, password_hash: str) -> bool:
    """Synchronizes a newly registered or Google-authenticated user to Supabase Cloud."""
    key = _supabase_service_role_key()
    if _is_cloud_sync_disabled() or not key:
        return False
    try:
        clean_email = (user_dict.get("email") or "").strip().lower()
        if not clean_email:
            return False
        encoded_email = urllib.parse.quote(clean_email)
        check_url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}&select=id,bio"
        req_check = urllib.request.Request(check_url, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}"
        })
        with urllib.request.urlopen(req_check, timeout=2.5) as resp:
            existing = json.loads(resp.read().decode("utf-8"))

        role_val = normalize_db_role(user_dict.get("role"), clean_email)
        if existing and isinstance(existing, list) and len(existing) > 0:
            if existing[0].get("bio") == "__URBANSCOPE_DELETED__":
                patch_url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{existing[0]['id']}"
                patch_body = json.dumps({
                    "email": clean_email,
                    "password_hash": password_hash,
                    "full_name": user_dict.get("full_name") or clean_email.split("@")[0],
                    "phone": user_dict.get("phone") or "",
                    "role": role_val,
                    "bio": "",
                    "email_verified_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).encode("utf-8")
                req_patch = urllib.request.Request(
                    patch_url,
                    data=patch_body,
                    headers={
                        "apikey": key,
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json"
                    },
                    method="PATCH"
                )
                with urllib.request.urlopen(req_patch, timeout=2.5):
                    return True
            return True

        post_url = f"{SUPABASE_URL}/rest/v1/users"
        post_body = json.dumps({
            "email": clean_email,
            "password_hash": password_hash,
            "full_name": user_dict.get("full_name") or clean_email.split("@")[0],
            "phone": user_dict.get("phone") or "",
            "role": role_val,
            "avatar_url": user_dict.get("avatar_url") or "",
            "google_id": user_dict.get("google_id") or None,
            "email_verified_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req_post = urllib.request.Request(
            post_url,
            data=post_body,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req_post, timeout=2.5):
            return True
    except Exception:
        return False


def sync_password_from_supabase_if_valid(clean_email: str, plain_password: str) -> Optional[str]:
    """Checks Supabase Cloud if account or password was created/updated remotely, syncing to SQLite if valid."""
    key = _supabase_service_role_key()
    if _is_cloud_sync_disabled() or not key:
        return None
    try:
        encoded_email = urllib.parse.quote(clean_email.strip().lower(), safe="")
        url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=eq.{encoded_email}"
            f"&select=id,email,password_hash,full_name,phone,role,avatar_url,google_id,bio,email_verified_at"
        )
        req = urllib.request.Request(url, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}"
        })
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                row = data[0]
                if row.get("bio") == "__URBANSCOPE_DELETED__" or row.get("password_hash") == "__DELETED_ACCOUNT__":
                    return None
                if row.get("email_verified_at") is False:
                    return None
                remote_hash = row.get("password_hash")
                if remote_hash and verify_password(plain_password, remote_hash):
                    norm_role = normalize_db_role(row.get("role"), clean_email)
                    conn = get_db_connection()
                    c = conn.cursor()
                    c.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
                    local_row = c.fetchone()
                    if local_row:
                        c.execute(
                            "UPDATE users SET password_hash = ?, role = ?, email_verified_at = ? WHERE id = ?",
                            (remote_hash, norm_role, row.get("email_verified_at"), local_row["id"])
                        )
                    else:
                        c.execute(
                            """
                            INSERT INTO users (email, password_hash, full_name, phone, role, avatar_url, google_id, email_verified_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                clean_email,
                                remote_hash,
                                (row.get("full_name") or clean_email.split("@")[0]).strip(),
                                (row.get("phone") or "").strip(),
                                norm_role,
                                row.get("avatar_url") or "assets/images/agent.jpg",
                                row.get("google_id") or None,
                                row.get("email_verified_at")
                            )
                        )
                        new_local_id = c.lastrowid
                        c.execute("UPDATE users SET role = ? WHERE id = ?", (norm_role, new_local_id))
                    conn.commit()
                    conn.close()
                    if norm_role == "admin":
                        AUTHORIZED_ADMIN_EMAILS.add(clean_email)
                    return remote_hash
    except Exception:
        pass
    return None


def sync_latest_password_from_supabase(clean_email: str) -> Optional[str]:
    """Fetches the latest password_hash from Supabase Cloud if reachable, syncing to local SQLite."""
    key = _supabase_service_role_key()
    if _is_cloud_sync_disabled() or not key:
        return None
    try:
        encoded_email = urllib.parse.quote(clean_email.strip().lower(), safe="")
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{encoded_email}&select=id,email,password_hash"
        req = urllib.request.Request(url, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}"
        })
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                remote_hash = data[0].get("password_hash")
                if remote_hash:
                    conn = get_db_connection()
                    c = conn.cursor()
                    c.execute("UPDATE users SET password_hash = ? WHERE LOWER(email) = ?", (remote_hash, clean_email))
                    conn.commit()
                    conn.close()
                    return remote_hash
    except Exception:
        pass
    return None


# ==========================================================
# AUTHENTICATION ENDPOINTS (WITH RBAC)
# ==========================================================

@router.get("/api/auth/csrf", tags=["Auth"])
def get_csrf_token(request: Request, response: Response):
    """Ensure a CSRF double-submit cookie exists for cookie-authenticated API calls."""
    existing = (request.cookies.get(CSRF_COOKIE_NAME) or "").strip() or None
    token = set_csrf_cookie(response, request, existing)
    return {"csrfToken": token}


@router.post("/api/auth/register/start", tags=["Auth"])
def start_email_registration(payload: EmailOtpStartRequest, request: Request):
    """Send a short-lived email code without revealing whether an account exists."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "reg_start",
        email=clean_email,
        limit=8,
        window_seconds=300,
        block_seconds=600,
        payload=payload,
        check_bot=True,
    )
    _require_otp_configuration()
    if not _email_is_valid(clean_email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if clean_email in AUTHORIZED_ADMIN_EMAILS or clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        return {"success": True, "message": OTP_GENERIC_REGISTER_MESSAGE}

    conn = get_db_connection()
    try:
        local_user = conn.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,)).fetchone()
    finally:
        conn.close()
    if not local_user and not _cloud_user_by_email(clean_email):
        _issue_otp_for_local_request(clean_email, "register", request)
    return {"success": True, "message": OTP_GENERIC_REGISTER_MESSAGE}


@router.post("/api/auth/register/check-code", tags=["Auth"])
@router.post("/api/auth/password/reset/check-code", tags=["Auth"])
def check_registration_code_endpoint(payload: OtpCodeCheckRequest, request: Request):
    """
    Validates whether the entered 6-digit email OTP is correct and active
    without consuming it, allowing client UI to guard subsequent steps (e.g. Terms & Policy).
    """
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "otp_check",
        email=clean_email,
        limit=15,
        window_seconds=300,
        block_seconds=600,
        check_bot=False,
    )
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Please enter a valid 6-digit verification code.")

    _require_otp_configuration()
    is_reset_route = "/password/reset/" in (request.url.path or "")
    purpose = "password_reset" if is_reset_route else (payload.purpose or "register")
    if purpose not in ("register", "password_reset"):
        raise HTTPException(status_code=400, detail="Invalid verification purpose.")
    supplied_hash = otp_digest(clean_email, purpose, code)
    if not check_local_challenge(clean_email, purpose, supplied_hash):
        raise HTTPException(
            status_code=400,
            detail="The verification code is incorrect or has expired. Please check your email or request a new code."
        )
    return {"success": True, "message": "Verification code is valid."}


@router.post("/api/auth/register/verify", response_model=AuthResponse, tags=["Auth"])
def complete_email_registration(payload: EmailOtpRegistrationComplete, request: Request, response: Response):
    """Consume a verified email code, create the client account, and start a session."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "reg_verify",
        email=clean_email,
        limit=10,
        window_seconds=300,
        block_seconds=600,
        payload=payload,
        check_bot=True,
    )
    if getattr(payload, "terms_accepted", True) is False:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service and Privacy Policy.")
    _require_otp_configuration()
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Check the verification code and email address.")
    if clean_email in AUTHORIZED_ADMIN_EMAILS or clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="This email cannot be registered through the client sign-up form.")

    if _cloud_user_by_email(clean_email):
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")

    supplied_hash = otp_digest(clean_email, "register", code)
    if not consume_local_challenge(clean_email, "register", supplied_hash):
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")

    password_hash = hash_password(payload.password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")
        cursor.execute(
            """INSERT INTO users (email, password_hash, full_name, phone, role, email_verified_at)
               VALUES (?, ?, ?, ?, 'user', ?)""",
            (clean_email, password_hash, payload.full_name.strip(), (payload.phone or "").strip(), datetime.now(timezone.utc).isoformat())
        )
        user_id = cursor.lastrowid
        conn.commit()
        cursor.execute(
            "SELECT id, email, full_name, phone, role, avatar_url, created_at FROM users WHERE id = ?",
            (user_id,)
        )
        user_dict = row_to_dict(cursor.fetchone())
    finally:
        conn.close()

    try:
        sync_new_user_to_supabase(user_dict, password_hash)
    except Exception:
        pass

    token = create_access_token({
        "sub": str(user_dict["id"]),
        "id": user_dict["id"],
        "email": user_dict["email"],
        "role": user_dict["role"]
    })
    _set_auth_cookies(response, request, token)
    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**sanitize_user_dict(user_dict)),
        redirect_url="/index.html",
        message="Email verified and registration complete."
    )


@router.post("/api/auth/password/reset/request", tags=["Auth"])
def request_password_reset(payload: PasswordResetRequest, request: Request):
    """Send a password-recovery code using the same response for known and unknown emails."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "pw_reset_req",
        email=clean_email,
        limit=8,
        window_seconds=300,
        block_seconds=600,
        payload=payload,
        check_bot=True,
    )
    _require_otp_configuration()
    if not _email_is_valid(clean_email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    conn = get_db_connection()
    try:
        local_user = conn.execute(
            "SELECT password_hash, bio FROM users WHERE LOWER(email) = ?", (clean_email,)
        ).fetchone()
    finally:
        conn.close()
    cloud_user = _cloud_user_by_email(clean_email)
    has_password = bool((local_user and local_user["password_hash"]) or (cloud_user and cloud_user.get("password_hash")))
    deleted = bool(
        (local_user and (local_user["bio"] == "__URBANSCOPE_DELETED__" or local_user["password_hash"] == "__DELETED_ACCOUNT__"))
        or (cloud_user and (cloud_user.get("bio") == "__URBANSCOPE_DELETED__" or cloud_user.get("password_hash") == "__DELETED_ACCOUNT__"))
    )
    cloud_only_reset_needs_service_key = bool(cloud_user and not local_user and not _supabase_service_role_key())
    if has_password and not deleted and not cloud_only_reset_needs_service_key:
        _issue_otp_for_local_request(clean_email, "password_reset", request)
    return {"success": True, "message": OTP_GENERIC_RESET_MESSAGE}


@router.post("/api/auth/password/reset/confirm", tags=["Auth"])
def complete_password_reset(payload: PasswordResetComplete, request: Request):
    """Reset a password after consuming a single-use email code."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "pw_reset_confirm",
        email=clean_email,
        limit=10,
        window_seconds=300,
        block_seconds=600,
        check_bot=False,
    )
    _require_otp_configuration()
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Enter a valid email address and six-digit code.")

    local_user = _cloud_user_by_email(clean_email)
    conn = get_db_connection()
    try:
        local_row = conn.execute(
            "SELECT id, bio, password_hash FROM users WHERE LOWER(email) = ?", (clean_email,)
        ).fetchone()
    finally:
        conn.close()
    if (local_row and (local_row["bio"] == "__URBANSCOPE_DELETED__" or local_row["password_hash"] == "__DELETED_ACCOUNT__")):
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")
    if not local_row and not local_user:
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")
    if local_user and not local_row and not _supabase_service_role_key():
        raise HTTPException(status_code=503, detail="Cloud password recovery is not configured on this server.")

    supplied_hash = otp_digest(clean_email, "password_reset", code)
    if not consume_local_challenge(clean_email, "password_reset", supplied_hash):
        raise HTTPException(status_code=400, detail="That code is invalid or expired. Request a new code and try again.")

    new_hash = hash_password(payload.password)
    if local_row:
        conn = get_db_connection()
        try:
            conn.execute(
                "UPDATE users SET password_hash = ?, email_verified_at = ? WHERE id = ?",
                (new_hash, datetime.now(timezone.utc).isoformat(), local_row["id"])
            )
            conn.commit()
        finally:
            conn.close()
    if local_user:
        cloud_updated = _verified_cloud_password_update(clean_email, new_hash)
        if not cloud_updated and not local_row:
            raise HTTPException(status_code=503, detail="Cloud password recovery is not configured. Set SUPABASE_SERVICE_ROLE_KEY and try again.")

    return {"success": True, "message": "Password updated. You can now log in with your new password."}


@router.post("/api/auth/register", response_model=AuthResponse, tags=["Auth"])
def register_user(payload: UserRegister, response: Response):
    """Legacy signup route is closed so callers cannot bypass email verification."""
    raise HTTPException(status_code=410, detail="Email verification is required. Use the registration verification flow.")


@router.post("/api/auth/login", response_model=AuthResponse, tags=["Auth"])
def login_user(payload: UserLogin, request: Request, response: Response):
    """
    Authenticates a user against verified database credentials and issues
    token with automatic redirection based on role.
    """
    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "login",
        email=clean_email,
        limit=10,
        window_seconds=300,
        block_seconds=600,
        payload=payload,
        check_bot=True,
    )

    # Synchronize latest password from Supabase Cloud for administrative accounts if updated remotely
    if clean_email in AUTHORIZED_ADMIN_EMAILS or clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        sync_latest_password_from_supabase(clean_email)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (clean_email,))
    user_row = cursor.fetchone()
    conn.close()

    if not user_row or not verify_password(payload.password, user_row["password_hash"]):
        # Fallback check if non-admin user updated remotely
        synced_hash = sync_password_from_supabase_if_valid(clean_email, payload.password)
        if synced_hash:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (clean_email,))
            user_row = cursor.fetchone()
            conn.close()

    if (
        not user_row
        or user_row["bio"] == "__URBANSCOPE_DELETED__"
        or user_row["password_hash"] == "__DELETED_ACCOUNT__"
        or not verify_password(payload.password, user_row["password_hash"])
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not user_row["email_verified_at"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email address before logging in."
        )

    user_dict = row_to_dict(user_row)
    user_email = user_dict["email"].lower().strip()
    user_role = user_dict["role"]

    # Store user identity and role in token
    token = create_access_token({
        "sub": str(user_dict["id"]),
        "id": user_dict["id"],
        "email": user_dict["email"],
        "role": user_dict["role"]
    })

    # Set cookie for server-side page navigation guards
    _set_auth_cookies(response, request, token)

    if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
        redirect_url = "/pages/superadmin/dashboard.html"
    elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
        redirect_url = "/pages/admin/dashboard.html"
    else:
        redirect_url = "/index.html"

    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**sanitize_user_dict(user_dict)),
        redirect_url=redirect_url,
        message="Sign in successful"
    )


@router.get("/api/auth/google/config", tags=["Auth"])
def get_google_auth_config():
    """Returns public Google Identity Services configuration status and OAuth Client ID."""
    client_id = get_google_client_id()
    return {
        "enabled": bool(client_id),
        "client_id": client_id
    }


@router.post("/api/auth/google", response_model=AuthResponse, tags=["Auth"])
def google_authenticate(payload: GoogleAuthRequest, request: Request, response: Response):
    """
    Verifies a Google Identity Services ID token or OAuth2 access token.
    If the user's Gmail is already registered, issues session tokens and returns role-aware redirect.
    If the user's Gmail is NOT yet registered, sends a 6-digit verification code to their Gmail
    and requires code verification + Terms & Policy agreement to complete registration.
    """
    _enforce_bot_and_rate(
        request,
        "google_auth",
        limit=15,
        window_seconds=300,
        block_seconds=600,
        check_bot=False,
    )
    google_info = verify_google_token(
        credential=payload.credential,
        access_token=payload.access_token
    )

    clean_email = google_info["email"].strip().lower()
    google_sub = google_info["google_id"]
    google_name = google_info["full_name"]
    try:
        google_avatar = sanitize_image_url(google_info.get("avatar_url"), default="")
    except ValueError:
        google_avatar = ""

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM users WHERE google_id = ? OR LOWER(email) = ?",
        (google_sub, clean_email)
    )
    existing_row = cursor.fetchone()

    if existing_row:
        existing = row_to_dict(existing_row)
        if existing.get("bio") == "__URBANSCOPE_DELETED__" or existing.get("password_hash") == "__DELETED_ACCOUNT__":
            conn.close()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated.")
        user_id = existing["id"]
        updates = ["email_verified_at = ?"]
        params = [datetime.now(timezone.utc).isoformat()]

        if not existing.get("google_id"):
            updates.append("google_id = ?")
            params.append(google_sub)

        if not (existing.get("full_name") or "").strip() and google_name:
            updates.append("full_name = ?")
            params.append(google_name)

        # Only populate Google avatar when user has no custom photo (preserve admin default/custom avatar)
        current_avatar = (existing.get("avatar_url") or "").strip()
        is_regular_user = existing.get("role") == "user"
        if google_avatar and (not current_avatar or (is_regular_user and current_avatar == "assets/images/agent.jpg")):
            updates.append("avatar_url = ?")
            params.append(google_avatar)

        if updates:
            params.append(user_id)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()

        cursor.execute(
            "SELECT id, email, full_name, phone, role, avatar_url, created_at FROM users WHERE id = ?",
            (user_id,)
        )
        user_dict = row_to_dict(cursor.fetchone())
        conn.close()

        user_email = user_dict["email"].lower().strip()
        user_role = user_dict["role"]

        token = create_access_token({
            "sub": str(user_dict["id"]),
            "id": user_dict["id"],
            "email": user_dict["email"],
            "role": user_role
        })

        _set_auth_cookies(response, request, token)

        if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
            redirect_url = "/pages/superadmin/dashboard.html"
        elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
            redirect_url = "/pages/admin/dashboard.html"
        else:
            redirect_url = "/index.html"

        return AuthResponse(
            success=True,
            token=token,
            user=UserResponse(**sanitize_user_dict(user_dict)),
            redirect_url=redirect_url,
            message="Google sign-in successful"
        )
    else:
        conn.close()
        # Gmail not yet registered! Send 6-digit verification code to their Gmail.
        _require_otp_configuration()
        _issue_otp_for_local_request(clean_email, "register", request)
        return AuthResponse(
            success=True,
            requires_verification=True,
            email=clean_email,
            full_name=google_name,
            avatar_url=google_avatar,
            message=f"We sent a 6-digit verification code to your Gmail ({clean_email}). Please enter the code and agree to the Terms of Service & Privacy Policy to complete your registration."
        )


@router.post("/api/auth/google/verify", response_model=AuthResponse, tags=["Auth"])
def complete_google_registration(payload: GoogleRegistrationComplete, request: Request, response: Response):
    """
    Consumes the email verification code sent to the user's Gmail, checks Terms & Policy
    acceptance, verifies Google credentials, creates the client account in SQLite and Supabase,
    and returns an authenticated session.
    """
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    if not payload.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail="You must agree to the Terms of Service and Privacy Policy to complete registration."
        )

    clean_email = payload.email.strip().lower()
    _enforce_bot_and_rate(
        request,
        "google_verify",
        email=clean_email,
        limit=10,
        window_seconds=300,
        block_seconds=600,
        check_bot=False,
    )
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Check the verification code and email address.")

    if clean_email in AUTHORIZED_ADMIN_EMAILS or clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="This email cannot be registered through the client sign-up flow.")

    if not (payload.credential or payload.access_token):
        raise HTTPException(status_code=401, detail="Google authentication token is required.")

    try:
        google_info = verify_google_token(
            credential=payload.credential,
            access_token=payload.access_token
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google authentication token could not be verified.") from exc

    if google_info["email"].strip().lower() != clean_email:
        raise HTTPException(status_code=401, detail="Google account email mismatch.")

    google_sub = google_info["google_id"]
    google_name = google_info["full_name"] or (payload.full_name or "")
    raw_avatar = google_info.get("avatar_url") or (payload.avatar_url or "")
    try:
        google_avatar = sanitize_image_url(raw_avatar, default="assets/images/agent.jpg")
    except ValueError:
        google_avatar = "assets/images/agent.jpg"

    _require_otp_configuration()
    supplied_hash = otp_digest(clean_email, "register", code)
    if not consume_local_challenge(clean_email, "register", supplied_hash):
        raise HTTPException(status_code=400, detail="That verification code is invalid or expired. Request a new code and try again.")

    pwd_hash = ""
    is_new_user = False
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, bio, password_hash FROM users WHERE LOWER(email) = ? OR (google_id IS NOT NULL AND google_id = ?)", (clean_email, google_sub))
        existing_user = cursor.fetchone()
        if existing_user:
            if existing_user["bio"] == "__URBANSCOPE_DELETED__" or existing_user["password_hash"] == "__DELETED_ACCOUNT__":
                raise HTTPException(status_code=403, detail="This account has been deactivated.")
            user_id = existing_user["id"]
            cursor.execute(
                "UPDATE users SET email_verified_at = ?, google_id = COALESCE(google_id, ?) WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), google_sub or None, user_id)
            )
            conn.commit()
        else:
            is_new_user = True
            role = determine_user_role(clean_email)
            pwd_hash = hash_password(secrets.token_urlsafe(32))
            cursor.execute("""
                INSERT INTO users (email, password_hash, full_name, phone, role, avatar_url, google_id, email_verified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (clean_email, pwd_hash, google_name or clean_email.split('@')[0], (payload.phone or "").strip(), role, google_avatar, google_sub or None, datetime.now(timezone.utc).isoformat()))
            conn.commit()
            user_id = cursor.lastrowid
            try:
                cursor.execute(
                    "DELETE FROM notifications WHERE LOWER(recipient_email) = ? OR inquiry_id IN (SELECT id FROM inquiries WHERE LOWER(client_email) = ?)",
                    (clean_email, clean_email)
                )
                cursor.execute("DELETE FROM inquiries WHERE LOWER(client_email) = ?", (clean_email,))
                conn.commit()
            except Exception:
                pass

        cursor.execute(
            "SELECT id, email, full_name, phone, role, avatar_url, created_at FROM users WHERE id = ?",
            (user_id,)
        )
        user_dict = row_to_dict(cursor.fetchone())
    finally:
        conn.close()

    if is_new_user and pwd_hash:
        try:
            sync_new_user_to_supabase(user_dict, pwd_hash)
        except Exception:
            pass

    user_email = user_dict["email"].lower().strip()
    user_role = user_dict["role"]

    token = create_access_token({
        "sub": str(user_dict["id"]),
        "id": user_dict["id"],
        "email": user_dict["email"],
        "role": user_role
    })

    _set_auth_cookies(response, request, token)

    if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
        redirect_url = "/pages/superadmin/dashboard.html"
    elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
        redirect_url = "/pages/admin/dashboard.html"
    else:
        redirect_url = "/index.html"

    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**sanitize_user_dict(user_dict)),
        redirect_url=redirect_url,
        message="Account verified and registered successfully! Welcome to UrbanScope."
    )


@router.post("/api/auth/logout", tags=["Auth"])
def logout_user(response: Response):
    """Sign out endpoint that invalidates session and CSRF cookies."""
    for cookie_name in ("access_token", "urbanscope_user_session", "urbanscope_admin_session", CSRF_COOKIE_NAME):
        response.delete_cookie(key=cookie_name, path="/")
    return {"success": True, "message": "Sign out successful"}


@router.get("/api/auth/me", tags=["Auth"])
def get_current_user_profile(user: dict = Depends(require_user)):
    """Returns the authenticated user's profile from token or cookie (excluding hashes/secrets)."""
    return sanitize_user_dict(user)


# ==========================================================
# PROFILE & PASSWORD MANAGEMENT ENDPOINTS
# ==========================================================

def _update_user_profile_impl(payload: AdminProfileUpdate, user: dict, *, allow_staff_fields: bool) -> UserResponse:
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = user["id"]
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    target_row = cursor.fetchone()
    if not target_row or target_row["bio"] == "__URBANSCOPE_DELETED__" or target_row["password_hash"] == "__DELETED_ACCOUNT__":
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    updates = []
    params = []

    if payload.full_name is not None and payload.full_name.strip():
        updates.append("full_name = ?")
        params.append(payload.full_name.strip())

    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone.strip())

    if payload.email is not None and payload.email.strip():
        clean_email = payload.email.strip().lower()
        if not _email_is_valid(clean_email):
            conn.close()
            raise HTTPException(status_code=400, detail="Enter a valid email address.")
        if clean_email != target_row["email"].lower():
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", (clean_email, user_id))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(status_code=400, detail="Email is already in use by another account.")
            updates.append("email = ?")
            params.append(clean_email)

    if payload.avatar_url is not None:
        try:
            safe_avatar = sanitize_image_url(payload.avatar_url, default="assets/images/agent.jpg")
        except ValueError as exc:
            conn.close()
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        updates.append("avatar_url = ?")
        params.append(safe_avatar)

    if allow_staff_fields:
        if payload.license_number is not None:
            updates.append("license_number = ?")
            params.append(payload.license_number.strip())
        if payload.title is not None:
            updates.append("title = ?")
            params.append(payload.title.strip())
        if payload.brokerage is not None:
            updates.append("brokerage = ?")
            params.append(payload.brokerage.strip())
        if payload.bio is not None:
            clean_bio = payload.bio.strip()
            if clean_bio == "__URBANSCOPE_DELETED__":
                conn.close()
                raise HTTPException(status_code=400, detail="Invalid profile bio value.")
            updates.append("bio = ?")
            params.append(clean_bio)

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    updated_row = cursor.fetchone()
    conn.close()

    if not updated_row:
        raise HTTPException(status_code=404, detail="User not found.")

    return UserResponse(**sanitize_user_dict(dict(updated_row)))


@router.put("/api/admin/profile", response_model=UserResponse, tags=["Admin"])
def update_admin_profile(
    payload: AdminProfileUpdate,
    user: dict = Depends(require_admin),
):
    """Updates personal and professional profile details for the authenticated admin."""
    return _update_user_profile_impl(payload, user, allow_staff_fields=True)


@router.put("/api/auth/me", response_model=UserResponse, tags=["Auth"])
def update_current_user_profile(
    payload: AdminProfileUpdate,
    user: dict = Depends(require_user),
):
    """Updates profile details for the active authenticated user."""
    is_staff = (user.get("role") or "").lower() in ("admin", "superadmin")
    return _update_user_profile_impl(payload, user, allow_staff_fields=is_staff)


def _update_user_password_impl(payload: PasswordChangeRequest, request: Request, user: dict) -> dict:
    _enforce_bot_and_rate(
        request,
        "pw_change",
        email=user.get("email", ""),
        limit=8,
        window_seconds=300,
        block_seconds=600,
        check_bot=False,
    )
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = user["id"]
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    target_row = cursor.fetchone()

    if not target_row or target_row["bio"] == "__URBANSCOPE_DELETED__" or target_row["password_hash"] == "__DELETED_ACCOUNT__":
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated. Please log in.")

    if not verify_password(payload.current_password, target_row["password_hash"]):
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current password you entered is incorrect."
        )

    clean_new_password = payload.new_password.strip()
    if len(clean_new_password) < 8:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long."
        )

    new_hash = hash_password(clean_new_password)
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()

    try:
        user_email = (target_row["email"] or "").strip()
        if user_email:
            sync_password_to_supabase(user_email, new_hash)
    except Exception:
        pass

    return {"success": True, "message": "Password updated successfully."}


@router.put("/api/admin/password", tags=["Admin"])
def update_admin_password(
    payload: PasswordChangeRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    """Changes password for the currently authenticated admin after verifying current password."""
    return _update_user_password_impl(payload, request, user)


@router.put("/api/auth/password", tags=["Auth"])
def update_user_password(
    payload: PasswordChangeRequest,
    request: Request,
    user: dict = Depends(require_user),
):
    """Changes password for the currently authenticated user after verifying current password."""
    return _update_user_password_impl(payload, request, user)


@router.get("/api/agent/profile", tags=["Agent"])
@router.get("/api/admin/profile/public", tags=["Agent"])
def get_public_agent_profile():
    """Returns the primary lead agent's public profile details for public display on the homepage and footer."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT email, full_name, phone, license_number, title, brokerage, bio, avatar_url
        FROM users
        WHERE COALESCE(bio, '') != '__URBANSCOPE_DELETED__'
          AND COALESCE(password_hash, '') != '__DELETED_ACCOUNT__'
          AND (role IN ('admin', 'superadmin') OR LOWER(email) IN ('miriamalobren@gmail.com', 'admin.realestate@gmail.com', 'miriam@gmail.com'))
        ORDER BY 
            CASE 
                WHEN LOWER(email) = 'miriamalobren@gmail.com' THEN 0
                WHEN LOWER(email) NOT IN ('admin.realestate@gmail.com', 'urbanscope.cvsu@gmail.com') AND email NOT LIKE '%@example.com' THEN 1 
                ELSE 2 
            END,
            CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
            id DESC
        LIMIT 1
    """)
    row = cursor.fetchone()
    conn.close()
    if not row:
        return {
            "name": "Miriam Lobren",
            "full_name": "Miriam Lobren",
            "email": "miriamalobren@gmail.com",
            "phone": "+63 918 964 5434",
            "license": "",
            "license_number": "",
            "title": "Real Estate Salesperson",
            "brokerage": "CD Miranda Realty",
            "bio": "Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.",
            "avatar_url": "assets/images/agent.jpg"
        }
    data = dict(row)
    data["name"] = data.get("full_name") or "Miriam Lobren"
    data["full_name"] = data["name"]
    data["license"] = data.get("license_number") or ""
    brok = (data.get("brokerage") or "").strip()
    if not brok:
        data["brokerage"] = "CD Miranda Realty"
    title = (data.get("title") or "").strip()
    if not title or title.lower() in ("real estate agent", "licensed real estate broker / agent"):
        data["title"] = "Real Estate Salesperson"
    try:
        data["avatar_url"] = sanitize_image_url(data.get("avatar_url"), default="assets/images/agent.jpg")
    except ValueError:
        data["avatar_url"] = "assets/images/agent.jpg"
    return data
