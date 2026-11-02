"""
UrbanScope - Authentication, User Profile & Public Agent Profile Router
Handles registration, sign-in, Google OAuth 2.0, profile updates, and password changes.
"""

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
from backend.database import determine_user_role, get_db_connection, row_to_dict
from backend.models import (
    AdminProfileUpdate,
    AuthResponse,
    GoogleAuthRequest,
    PasswordChangeRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter()


# ==========================================================
# AUTHENTICATION ENDPOINTS (WITH RBAC)
# ==========================================================

@router.post("/api/auth/register", response_model=AuthResponse, tags=["Auth"])
def register_user(payload: UserRegister, response: Response):
    """
    Registers a new user account with automatic database role detection:
    - admin.realestate@gmail.com -> 'admin'
    - urbanscope.cvsu@gmail.com -> 'superadmin'
    - all other emails -> 'user'
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    clean_email = payload.email.strip().lower()

    # Check for existing email
    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # Automatic role assignment (also strictly enforced by SQLite trigger)
    role = determine_user_role(clean_email)
    pwd_hash = hash_password(payload.password)

    cursor.execute("""
        INSERT INTO users (email, password_hash, full_name, phone, role)
        VALUES (?, ?, ?, ?, ?)
    """, (clean_email, pwd_hash, payload.full_name.strip(), payload.phone.strip() if payload.phone else "", role))
    conn.commit()

    user_id = cursor.lastrowid
    cursor.execute(
        "SELECT id, email, full_name, phone, role, avatar_url, google_id, created_at FROM users WHERE id = ?",
        (user_id,)
    )
    user_dict = row_to_dict(cursor.fetchone())
    conn.close()

    # Issue JWT containing user id, email, and role
    token = create_access_token({
        "sub": str(user_dict["id"]),
        "id": user_dict["id"],
        "email": user_dict["email"],
        "role": user_dict["role"]
    })

    # Set secure cookie for browser route protection
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    # Automatic login redirection based on identity and role
    if user_dict["role"] == "superadmin" and clean_email in AUTHORIZED_SUPERADMIN_EMAILS:
        redirect_url = "/pages/superadmin/dashboard.html"
    elif user_dict["role"] in AUTHORIZED_ADMIN_ROLES or clean_email in AUTHORIZED_ADMIN_EMAILS:
        redirect_url = "/pages/admin/dashboard.html"
    else:
        redirect_url = "/index.html"

    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse(**user_dict),
        redirect_url=redirect_url,
        message="Registration successful"
    )


@router.post("/api/auth/login", response_model=AuthResponse, tags=["Auth"])
def login_user(payload: UserLogin, response: Response):
    """
    Authenticates a user against verified database credentials and issues
    token with automatic redirection based on role:
    - Superadmin (urbanscope.cvsu@gmail.com) -> /pages/superadmin/dashboard.html
    - Authorized admins (admin.realestate@gmail.com) -> /pages/admin/dashboard.html
    - Normal users -> /index.html (User dashboard)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    clean_email = payload.email.strip().lower()

    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (clean_email,))
    user_row = cursor.fetchone()
    conn.close()

    if not user_row or not verify_password(payload.password, user_row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
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
def google_authenticate(payload: GoogleAuthRequest, response: Response):
    """
    Verifies a Google Identity Services ID token or OAuth2 access token,
    auto-creates or links the corresponding SQLite user record, issues an
    UrbanScope JWT + HTTP-only cookie, and returns role-aware redirection.
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
        updates = []
        params = []

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
    else:
        role = determine_user_role(clean_email)
        pwd_hash = hash_password(secrets.token_urlsafe(32))
        avatar_to_save = google_avatar if google_avatar else "assets/images/agent.jpg"

        cursor.execute("""
            INSERT INTO users (email, password_hash, full_name, phone, role, avatar_url, google_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (clean_email, pwd_hash, google_name, "", role, avatar_to_save, google_sub))
        conn.commit()
        user_id = cursor.lastrowid

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
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated. Please log in.")

    user_id = user["id"]
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row or not verify_password(payload.current_password, row["password_hash"]):
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
        WHERE role IN ('admin', 'superadmin') OR LOWER(email) IN ('admin.realestate@gmail.com', 'miriam@gmail.com')
        ORDER BY 
            CASE 
                WHEN LOWER(email) NOT IN ('admin.realestate@gmail.com', 'urbanscope.cvsu@gmail.com') AND email NOT LIKE '%@example.com' THEN 0 
                ELSE 1 
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
            "email": "miriam@gmail.com",
            "phone": "09123456789",
            "license": "PRC REB #0031892",
            "license_number": "PRC REB #0031892",
            "title": "Real Estate Agent",
            "brokerage": "UrbanScope",
            "bio": "Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.",
            "avatar_url": "assets/images/agent.jpg"
        }
    data = dict(row)
    data["name"] = data.get("full_name") or "Miriam Lobren"
    data["license"] = data.get("license_number") or ""
    brok = (data.get("brokerage") or "").strip()
    if not brok or (brok.lower().startswith("cd ") and "realty" in brok.lower()):
        data["brokerage"] = "UrbanScope"
    if data.get("email"):
        AUTHORIZED_ADMIN_EMAILS.add(data["email"].lower().strip())
    return data
