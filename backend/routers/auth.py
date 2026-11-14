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


def _supabase_api_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or SUPABASE_ANON_KEY


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
    origin = request.headers.get("origin")
    if not origin:
        return True
    try:
        origin_host = urllib.parse.urlparse(origin).hostname
        request_host = request.url.hostname
        if origin_host == request_host:
            return True
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        return origin_host in local_hosts and request_host in local_hosts
    except Exception:
        return False


def _cloud_user_by_email(email: str) -> Optional[dict]:
    """Look up the cloud account with server credentials when available."""
    if _is_cloud_sync_disabled():
        return None
    try:
        encoded = urllib.parse.quote(email, safe="")
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{encoded}&select=id,email,password_hash,role,full_name,phone,bio"
        key = _supabase_api_key()
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
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
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
    ip_address = request.client.host if request.client else "unknown"
    if not issue_local_challenge(email, purpose, digest, ip_digest(ip_address)):
        return False
    print(f"[AUTH OTP] Issued code for {email} ({purpose}): {code}")
    try:
        send_otp_email(email, purpose, code)
        return True
    except Exception as e:
        print(f"[AUTH OTP] Email sending failed: {e}")
        return True


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
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or SUPABASE_ANON_KEY
    if _is_cloud_sync_disabled() or not key:
        return False
    try:
        clean_email = email.strip().lower()
        encoded_email = urllib.parse.quote(clean_email)
        url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}"
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
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
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
    if _is_cloud_sync_disabled():
        return None
    try:
        encoded_email = urllib.parse.quote(clean_email)
        url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=ilike.{encoded_email}"
            f"&select=id,email,password_hash,full_name,phone,role,avatar_url,google_id,bio"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
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
    if _is_cloud_sync_disabled():
        return None
    try:
        encoded_email = urllib.parse.quote(clean_email)
        url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}&select=id,email,password_hash"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
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

@router.post("/api/auth/register/start", tags=["Auth"])
def start_email_registration(payload: EmailOtpStartRequest, request: Request):
    """Send a short-lived email code without revealing whether an account exists."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    _require_otp_configuration()
    clean_email = payload.email.strip().lower()
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
def check_registration_code_endpoint(payload: OtpCodeCheckRequest, request: Request):
    """
    Validates whether the entered 6-digit email OTP is correct and active
    without consuming it, allowing client UI to guard subsequent steps (e.g. Terms & Policy).
    """
    clean_email = payload.email.strip().lower()
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Please enter a valid 6-digit verification code.")

    _require_otp_configuration()
    purpose = payload.purpose or "register"
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
    _require_otp_configuration()
    clean_email = payload.email.strip().lower()
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
            "SELECT id, email, full_name, phone, role, avatar_url, google_id, created_at FROM users WHERE id = ?",
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
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax", max_age=7 * 24 * 3600, path="/")
    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**user_dict),
        redirect_url="/index.html",
        message="Email verified and registration complete."
    )


@router.post("/api/auth/password/reset/request", tags=["Auth"])
def request_password_reset(payload: PasswordResetRequest, request: Request):
    """Send a password-recovery code using the same response for known and unknown emails."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    _require_otp_configuration()
    clean_email = payload.email.strip().lower()
    if not _email_is_valid(clean_email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    conn = get_db_connection()
    try:
        local_user = conn.execute(
            "SELECT password_hash FROM users WHERE LOWER(email) = ?", (clean_email,)
        ).fetchone()
    finally:
        conn.close()
    cloud_user = _cloud_user_by_email(clean_email)
    has_password = bool((local_user and local_user["password_hash"]) or (cloud_user and cloud_user.get("password_hash")))
    deleted = bool((cloud_user and (cloud_user.get("bio") == "__URBANSCOPE_DELETED__" or cloud_user.get("password_hash") == "__DELETED_ACCOUNT__")))
    cloud_only_reset_needs_service_key = bool(cloud_user and not local_user and not _supabase_service_role_key())
    if has_password and not deleted and not cloud_only_reset_needs_service_key:
        _issue_otp_for_local_request(clean_email, "password_reset", request)
    return {"success": True, "message": OTP_GENERIC_RESET_MESSAGE}


@router.post("/api/auth/password/reset/confirm", tags=["Auth"])
def complete_password_reset(payload: PasswordResetComplete, request: Request):
    """Reset a password after consuming a single-use email code."""
    if not _request_origin_allowed(request):
        raise HTTPException(status_code=403, detail="This request is not allowed.")
    _require_otp_configuration()
    clean_email = payload.email.strip().lower()
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Enter a valid email address and six-digit code.")

    local_user = _cloud_user_by_email(clean_email)
    conn = get_db_connection()
    try:
        local_row = conn.execute(
            "SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,)
        ).fetchone()
    finally:
        conn.close()
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
def login_user(payload: UserLogin, response: Response):
    """
    Authenticates a user against verified database credentials and issues
    token with automatic redirection based on role:
    - Superadmin (urbanscope.cvsu@gmail.com) -> /pages/superadmin/dashboard.html
    - Authorized admins (admin.realestate@gmail.com) -> /pages/admin/dashboard.html
    - Normal users -> /index.html (User dashboard)
    """
    clean_email = payload.email.strip().lower()

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

    if not user_row or not verify_password(payload.password, user_row["password_hash"]):
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
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    # Automatic redirection logic:
    # - urbanscope.cvsu@gmail.com (superadmin) -> Superadmin Dashboard
    # - admin.realestate@gmail.com (admin) -> Admin Dashboard
    # - Otherwise -> Normal user dashboard
    if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
        redirect_url = "/pages/superadmin/dashboard.html"
    elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
        redirect_url = "/pages/admin/dashboard.html"
    else:
        redirect_url = "/index.html"

    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**user_dict),
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
    google_info = verify_google_token(
        credential=payload.credential,
        access_token=payload.access_token
    )

    clean_email = google_info["email"].strip().lower()
    google_sub = google_info["google_id"]
    google_name = google_info["full_name"]
    google_avatar = google_info["avatar_url"]

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM users WHERE google_id = ? OR LOWER(email) = ?",
        (google_sub, clean_email)
    )
    existing_row = cursor.fetchone()

    if existing_row:
        existing = row_to_dict(existing_row)
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
            "SELECT id, email, full_name, phone, role, avatar_url, google_id, created_at FROM users WHERE id = ?",
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

        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=7 * 24 * 3600,
            path="/"
        )

        if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
            redirect_url = "/pages/superadmin/dashboard.html"
        elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
            redirect_url = "/pages/admin/dashboard.html"
        else:
            redirect_url = "/index.html"

        return AuthResponse(
            success=True,
            token=token,
            user=UserResponse(**user_dict),
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
            google_id=google_sub,
            message=f"We sent a 6-digit verification code to your Gmail ({clean_email}). Please enter the code and agree to the Terms of Service & Privacy Policy to complete your registration."
        )


@router.post("/api/auth/google/verify", response_model=AuthResponse, tags=["Auth"])
def complete_google_registration(payload: GoogleRegistrationComplete, request: Request, response: Response):
    """
    Consumes the email verification code sent to the user's Gmail, checks Terms & Policy
    acceptance, verifies Google credentials, creates the client account in SQLite and Supabase,
    and returns an authenticated session.
    """
    if not payload.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail="You must agree to the Terms of Service and Privacy Policy to complete registration."
        )

    clean_email = payload.email.strip().lower()
    code = payload.code.strip()
    if not _email_is_valid(clean_email) or not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Check the verification code and email address.")

    if clean_email in AUTHORIZED_ADMIN_EMAILS or clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="This email cannot be registered through the client sign-up flow.")

    _require_otp_configuration()
    supplied_hash = otp_digest(clean_email, "register", code)
    if not consume_local_challenge(clean_email, "register", supplied_hash):
        raise HTTPException(status_code=400, detail="That verification code is invalid or expired. Request a new code and try again.")

    # Re-verify Google token if provided, to ensure authenticity
    google_sub = payload.google_id or ""
    google_name = payload.full_name or ""
    google_avatar = payload.avatar_url or ""
    if payload.credential or payload.access_token:
        try:
            google_info = verify_google_token(
                credential=payload.credential,
                access_token=payload.access_token
            )
            if google_info["email"].strip().lower() == clean_email:
                google_sub = google_info["google_id"]
                google_name = google_info["full_name"] or google_name
                google_avatar = google_info["avatar_url"] or google_avatar
        except Exception:
            pass

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? OR (google_id IS NOT NULL AND google_id = ?)", (clean_email, google_sub))
        existing_user = cursor.fetchone()
        if existing_user:
            user_id = existing_user["id"]
            cursor.execute(
                "UPDATE users SET email_verified_at = ?, google_id = COALESCE(google_id, ?) WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), google_sub or None, user_id)
            )
            conn.commit()
        else:
            role = determine_user_role(clean_email)
            pwd_hash = hash_password(secrets.token_urlsafe(32))
            avatar_to_save = google_avatar if google_avatar else "assets/images/agent.jpg"
            cursor.execute("""
                INSERT INTO users (email, password_hash, full_name, phone, role, avatar_url, google_id, email_verified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (clean_email, pwd_hash, google_name or clean_email.split('@')[0], (payload.phone or "").strip(), role, avatar_to_save, google_sub or None, datetime.now(timezone.utc).isoformat()))
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
            "SELECT id, email, full_name, phone, role, avatar_url, google_id, created_at FROM users WHERE id = ?",
            (user_id,)
        )
        user_dict = row_to_dict(cursor.fetchone())
    finally:
        conn.close()

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

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
        redirect_url = "/pages/superadmin/dashboard.html"
    elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
        redirect_url = "/pages/admin/dashboard.html"
    else:
        redirect_url = "/index.html"

    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**user_dict),
        redirect_url=redirect_url,
        message="Account verified and registered successfully! Welcome to UrbanScope."
    )


@router.post("/api/auth/logout", tags=["Auth"])
@router.get("/api/auth/logout", tags=["Auth"])
def logout_user(response: Response, redirect: Optional[str] = None):
    """Sign out endpoint that invalidates the session cookie."""
    response.delete_cookie(key="access_token", path="/")
    if redirect:
        return RedirectResponse(url=redirect, status_code=status.HTTP_302_FOUND)
    return {"success": True, "message": "Sign out successful"}


@router.get("/api/auth/me", tags=["Auth"])
def get_current_user_profile(user: Optional[dict] = Depends(get_current_user_from_request)):
    """Returns the authenticated user's profile from token or cookie."""
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


# ==========================================================
# PROFILE & PASSWORD MANAGEMENT ENDPOINTS
# ==========================================================

@router.put("/api/admin/profile", response_model=UserResponse, tags=["Admin"])
@router.put("/api/auth/me", response_model=UserResponse, tags=["Auth"])
def update_current_user_profile(
    payload: AdminProfileUpdate,
    user: Optional[dict] = Depends(get_current_user_from_request)
):
    """Updates profile details (phone, full name, email, license, title, brokerage, bio, avatar) for the active user/admin."""
    conn = get_db_connection()
    cursor = conn.cursor()

    target_email = (payload.email or "").strip().lower()
    original_email = (payload.original_email or "").strip().lower()
    user_id = None
    target_row = None

    # 1. Match account by original_email if explicitly provided (prior to editing)
    if original_email:
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (original_email,))
        target_row = cursor.fetchone()
        if target_row:
            user_id = target_row["id"]

    # 2. Match account by payload target email if explicitly provided
    if not user_id and target_email:
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (target_email,))
        target_row = cursor.fetchone()
        if target_row:
            user_id = target_row["id"]

    # 3. If no user matched by email, fallback to authenticated user
    if not user_id and user:
        user_id = user["id"]
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        target_row = cursor.fetchone()

    # 4. Fallback to default lead admin if still unauthenticated in local development
    if not user_id:
        cursor.execute("""
            SELECT * FROM users 
            WHERE role IN ('admin', 'superadmin') OR LOWER(email) = 'admin.realestate@gmail.com' 
            ORDER BY 
                CASE 
                    WHEN LOWER(email) NOT IN ('admin.realestate@gmail.com', 'urbanscope.cvsu@gmail.com') AND email NOT LIKE '%@example.com' THEN 0 
                    ELSE 1 
                END,
                CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
                id ASC 
            LIMIT 1
        """)
        target_row = cursor.fetchone()
        if target_row:
            user_id = target_row["id"]

    if not user_id or not target_row:
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
        if clean_email != target_row["email"].lower():
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", (clean_email, user_id))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(status_code=400, detail="Email is already in use by another account.")
            updates.append("email = ?")
            params.append(clean_email)
            AUTHORIZED_ADMIN_EMAILS.add(clean_email)

    if payload.avatar_url is not None:
        updates.append("avatar_url = ?")
        params.append(payload.avatar_url.strip())

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
        updates.append("bio = ?")
        params.append(payload.bio.strip())

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    updated_row = cursor.fetchone()
    conn.close()

    if not updated_row:
        raise HTTPException(status_code=404, detail="User not found.")

    return dict(updated_row)


@router.put("/api/admin/password", tags=["Admin"])
@router.put("/api/auth/password", tags=["Auth"])
def update_user_password(
    payload: PasswordChangeRequest,
    user: Optional[dict] = Depends(get_current_user_from_request)
):
    """Changes password for the currently authenticated user/admin after verifying current password."""
    user_id = None
    target_row = None
    conn = get_db_connection()
    cursor = conn.cursor()

    if user:
        user_id = user["id"]
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        target_row = cursor.fetchone()

    # Match by payload email if provided
    if not user_id and payload.email:
        cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (payload.email.strip().lower(),))
        target_row = cursor.fetchone()
        if target_row:
            user_id = target_row["id"]

    # Fallback to default lead admin if still unauthenticated in local development
    if not user_id:
        cursor.execute("""
            SELECT * FROM users 
            WHERE role IN ('admin', 'superadmin') OR LOWER(email) IN ('miriamalobren@gmail.com', 'admin.realestate@gmail.com') 
            ORDER BY 
                CASE 
                    WHEN LOWER(email) = 'miriamalobren@gmail.com' THEN 0 
                    WHEN LOWER(email) = 'admin.realestate@gmail.com' THEN 1 
                    ELSE 2 
                END,
                id ASC 
            LIMIT 1
        """)
        target_row = cursor.fetchone()
        if target_row:
            user_id = target_row["id"]

    if not user_id or not target_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated. Please log in.")

    if not verify_password(payload.current_password, target_row["password_hash"]):
        # Check if password was changed remotely on Supabase Cloud
        user_email = (target_row["email"] if target_row else payload.email) or ""
        synced_hash = sync_password_from_supabase_if_valid(user_email, payload.current_password)
        if synced_hash:
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            target_row = cursor.fetchone()
        else:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The current password you entered is incorrect."
            )

    clean_new_password = payload.new_password.strip()
    if len(clean_new_password) < 6:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long."
        )

    new_hash = hash_password(clean_new_password)
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()

    # Sync updated password to Supabase Cloud so other devices & phones immediately recognize it
    try:
        user_email = (target_row["email"] if target_row else payload.email) or ""
        if user_email:
            sync_password_to_supabase(user_email, new_hash)
    except Exception:
        pass

    return {"success": True, "message": "Password updated successfully."}


@router.get("/api/agent/profile", tags=["Agent"])
@router.get("/api/admin/profile/public", tags=["Agent"])
def get_public_agent_profile():
    """Returns the primary lead agent/admin's public profile details for public display on the homepage and footer."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, email, full_name, phone, license_number, title, brokerage, bio, avatar_url, role
        FROM users
        WHERE role IN ('admin', 'superadmin') OR LOWER(email) IN ('miriamalobren@gmail.com', 'admin.realestate@gmail.com', 'miriam@gmail.com')
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
    data["license"] = data.get("license_number") or ""
    brok = (data.get("brokerage") or "").strip()
    if not brok:
        data["brokerage"] = "CD Miranda Realty"
    title = (data.get("title") or "").strip()
    if not title or title.lower() in ("real estate agent", "licensed real estate broker / agent"):
        data["title"] = "Real Estate Salesperson"
    if data.get("email"):
        AUTHORIZED_ADMIN_EMAILS.add(data["email"].lower().strip())
    return data
