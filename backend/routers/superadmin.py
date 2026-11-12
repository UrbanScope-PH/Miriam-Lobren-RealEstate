"""
UrbanScope - User Directory & Superadmin Executive Governance Router
Handles user management, RBAC role updates, executive metrics, and SQLite diagnostics.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import AUTHORIZED_ADMIN_EMAILS, hash_password, require_admin, require_superadmin
from backend.database import DB_PATH, get_db_connection, row_to_dict
from backend.models import SuperadminCreateUser, SuperadminUpdateUser, UserRoleUpdate
from backend.routers.auth import (
    SUPABASE_ANON_KEY as _SUPABASE_ANON_KEY,
    SUPABASE_URL,
    normalize_db_role,
    sync_password_to_supabase,
)

router = APIRouter()

# Reads may use the public key; cloud account mutations require the private server key.
SUPABASE_ANON_KEY = _SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

_LAST_CLOUD_USER_SYNC_TS: float = 0.0
_CLOUD_SYNC_MIN_INTERVAL_SEC: float = 10.0


def _cloud_sync_enabled() -> bool:
    return os.environ.get("URBANSCOPE_DISABLE_CLOUD_SYNC") != "1"


def _pull_supabase_users_to_sqlite(force: bool = False) -> None:
    """
    Lightweight, non-blocking sync of active Supabase Cloud user accounts into local SQLite
    so accounts registered on Vercel / mobile appear in local Superadmin governance.
    """
    global _LAST_CLOUD_USER_SYNC_TS
    if not _cloud_sync_enabled():
        return
    now = time.monotonic()
    if not force and (now - _LAST_CLOUD_USER_SYNC_TS) < _CLOUD_SYNC_MIN_INTERVAL_SEC:
        return
    _LAST_CLOUD_USER_SYNC_TS = now

    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/users"
            "?select=email,password_hash,full_name,phone,role,avatar_url,google_id,bio,created_at"
            "&order=id.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
        })
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            remote_users = json.loads(resp.read().decode("utf-8"))

        if not isinstance(remote_users, list) or not remote_users:
            return

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT LOWER(email) AS clean_email FROM users")
        local_emails = {row["clean_email"] for row in cursor.fetchall() if row["clean_email"]}

        inserted_any = False
        for ru in remote_users:
            clean_email = (ru.get("email") or "").strip().lower()
            if not clean_email or clean_email in local_emails:
                continue
            if ru.get("bio") == "__URBANSCOPE_DELETED__" or ru.get("password_hash") == "__DELETED_ACCOUNT__":
                continue
            if ru.get("email_verified_at") is False:
                continue

            norm_role = normalize_db_role(ru.get("role"), clean_email)
            pwd_hash = ru.get("password_hash") or hash_password(f"cloud-sync-{clean_email}")
            full_name = (ru.get("full_name") or clean_email.split("@")[0]).strip()
            phone = (ru.get("phone") or "").strip()
            avatar_url = (ru.get("avatar_url") or "assets/images/agent.jpg").strip()
            google_id = ru.get("google_id") or None

            cursor.execute(
                """
                INSERT INTO users (email, password_hash, full_name, phone, role, avatar_url, google_id, email_verified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (clean_email, pwd_hash, full_name, phone, norm_role, avatar_url, google_id, ru["email_verified_at"])
            )
            new_id = cursor.lastrowid
            # Re-apply role after trg_user_role_insert in case remote account was promoted to admin
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (norm_role, new_id))
            if norm_role == "admin":
                AUTHORIZED_ADMIN_EMAILS.add(clean_email)
            local_emails.add(clean_email)
            inserted_any = True

        if inserted_any:
            conn.commit()
        conn.close()
    except Exception:
        pass


def _sync_create_user_to_supabase(
    clean_email: str,
    password_hash: str,
    full_name: str,
    phone: str,
    assigned_role: str
) -> None:
    """Syncs a Superadmin-created account to Supabase Cloud (inserting or reactivating if soft-deleted)."""
    if not _cloud_sync_enabled() or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        encoded_email = urllib.parse.quote(clean_email)
        check_url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}&select=id,bio"
        req_check = urllib.request.Request(check_url, headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
        })
        with urllib.request.urlopen(req_check, timeout=2.5) as resp:
            existing = json.loads(resp.read().decode("utf-8"))

        if existing and isinstance(existing, list) and len(existing) > 0:
            patch_url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{existing[0]['id']}"
            patch_body = json.dumps({
                "email": clean_email,
                "password_hash": password_hash,
                "full_name": full_name,
                "phone": phone,
                "role": assigned_role,
                "bio": "",
                "email_verified_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).encode("utf-8")
            req_patch = urllib.request.Request(
                patch_url,
                data=patch_body,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json"
                },
                method="PATCH"
            )
            with urllib.request.urlopen(req_patch, timeout=2.5):
                return

        post_url = f"{SUPABASE_URL}/rest/v1/users"
        post_body = json.dumps({
            "email": clean_email,
            "password_hash": password_hash,
            "full_name": full_name,
            "phone": phone,
            "role": assigned_role,
            "email_verified_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req_post = urllib.request.Request(
            post_url,
            data=post_body,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req_post, timeout=2.5):
            return
    except Exception:
        pass


def _sync_update_user_to_supabase(match_email: str, patch_fields: dict) -> None:
    """Syncs Superadmin profile/role/password edits to Supabase Cloud by matching email."""
    if not _cloud_sync_enabled() or not SUPABASE_SERVICE_ROLE_KEY or not match_email or not patch_fields:
        return
    try:
        encoded_email = urllib.parse.quote(match_email.strip().lower())
        url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}"
        payload = dict(patch_fields)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=2.5):
            return
    except Exception:
        pass


def _sync_delete_user_to_supabase(target_email: str, user_id: int = None) -> None:
    """Deletes an account and its inquiries from Supabase Cloud, falling back to email scramble if DELETE RLS is blocked."""
    if not _cloud_sync_enabled() or not SUPABASE_SERVICE_ROLE_KEY or not target_email:
        return
    try:
        clean_email = target_email.strip().lower()
        encoded_email = urllib.parse.quote(clean_email)

        # 1. Delete associated inquiries from Supabase Cloud
        try:
            inq_url = f"{SUPABASE_URL}/rest/v1/inquiries?client_email=ilike.{encoded_email}"
            req_inq = urllib.request.Request(
                inq_url,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                },
                method="DELETE"
            )
            with urllib.request.urlopen(req_inq, timeout=3.0):
                pass
        except Exception:
            pass

        # Query all user IDs matching target email (including historical deleted)
        matching_ids = set()
        if user_id:
            matching_ids.add(str(user_id))
        try:
            users_query_url = f"{SUPABASE_URL}/rest/v1/users?or=(email.ilike.{encoded_email},email.ilike.deleted_*_{encoded_email})&select=id"
            req_users = urllib.request.Request(
                users_query_url,
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                }
            )
            with urllib.request.urlopen(req_users, timeout=3.0) as resp:
                u_rows = json.loads(resp.read().decode("utf-8"))
                if isinstance(u_rows, list):
                    for u in u_rows:
                        if u and u.get("id"):
                            matching_ids.add(str(u["id"]))
        except Exception:
            pass

        for uid in matching_ids:
            try:
                inq_id_url = f"{SUPABASE_URL}/rest/v1/inquiries?client_id=eq.{uid}"
                req_inq_id = urllib.request.Request(
                    inq_id_url,
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    },
                    method="DELETE"
                )
                with urllib.request.urlopen(req_inq_id, timeout=3.0):
                    pass
            except Exception:
                pass
            try:
                notif_url = f"{SUPABASE_URL}/rest/v1/notifications?user_id=eq.{uid}"
                req_notif = urllib.request.Request(
                    notif_url,
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    },
                    method="DELETE"
                )
                with urllib.request.urlopen(req_notif, timeout=3.0):
                    pass
            except Exception:
                pass
            try:
                appt_url = f"{SUPABASE_URL}/rest/v1/appointments?user_id=eq.{uid}"
                req_appt = urllib.request.Request(
                    appt_url,
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    },
                    method="DELETE"
                )
                with urllib.request.urlopen(req_appt, timeout=3.0):
                    pass
            except Exception:
                pass
            try:
                saved_url = f"{SUPABASE_URL}/rest/v1/saved_properties?user_id=eq.{uid}"
                req_saved = urllib.request.Request(
                    saved_url,
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    },
                    method="DELETE"
                )
                with urllib.request.urlopen(req_saved, timeout=3.0):
                    pass
            except Exception:
                pass

        # 2. Delete user from Supabase Cloud
        del_url = f"{SUPABASE_URL}/rest/v1/users?email=ilike.{encoded_email}"
        req_del = urllib.request.Request(
            del_url,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Prefer": "return=representation"
            },
            method="DELETE"
        )
        with urllib.request.urlopen(req_del, timeout=3.0) as resp:
            deleted = json.loads(resp.read().decode("utf-8"))
            if isinstance(deleted, list) and len(deleted) > 0:
                return

        # 3. Fallback: scramble email and mark soft-delete if physical DELETE was blocked by RLS
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        scrambled_email = f"deleted_{timestamp}_{clean_email}"
        soft_body = json.dumps({
            "email": scrambled_email,
            "bio": "__URBANSCOPE_DELETED__",
            "google_id": None,
            "role": "user",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        req_soft = urllib.request.Request(
            del_url,
            data=soft_body,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json"
            },
            method="PATCH"
        )
        with urllib.request.urlopen(req_soft, timeout=3.0):
            return
    except Exception:
        pass


# ==========================================================
# SUPERADMIN EXECUTIVE & USER DIRECTORY ENDPOINTS
# ==========================================================

@router.get("/api/superadmin/overview", tags=["Superadmin"])
def get_superadmin_overview(current_superadmin: dict = Depends(require_superadmin)):
    """Executive overview with master counts, database metrics, and system status."""
    _pull_supabase_users_to_sqlite()
    conn = get_db_connection()
    cursor = conn.cursor()

    # User counts by role
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")
    superadmin_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    admin_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role IN ('user', 'client') OR role IS NULL")
    normal_users_count = cursor.fetchone()[0]

    # Properties stats
    cursor.execute("SELECT COUNT(*) FROM properties")
    total_properties = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM properties WHERE LOWER(status) = 'available'")
    available_properties = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM properties WHERE LOWER(status) = 'sold'")
    sold_properties = cursor.fetchone()[0]

    # Inquiries stats
    cursor.execute("SELECT COUNT(*) FROM inquiries")
    total_inquiries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%review%' OR LOWER(status) LIKE '%pending%'")
    pending_inquiries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%approved%'")
    approved_inquiries = cursor.fetchone()[0]

    # Database file stats
    db_size_kb = round(DB_PATH.stat().st_size / 1024, 2) if DB_PATH.exists() else 0.0

    # Trigger health check
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_user_role_insert', 'set_user_role_on_insert')")
    trigger_exists = bool(cursor.fetchone())

    conn.close()

    return {
        "status": "operational",
        "engine": "sqlite",
        "superadmin_email": current_superadmin.get("email"),
        "metrics": {
            "total_users": total_users,
            "superadmins": superadmin_count,
            "admins": admin_count,
            "regular_users": normal_users_count,
            "total_properties": total_properties,
            "available_properties": available_properties,
            "sold_properties": sold_properties,
            "total_inquiries": total_inquiries,
            "pending_inquiries": pending_inquiries,
            "approved_inquiries": approved_inquiries,
            "db_size_kb": db_size_kb,
            "trigger_active": trigger_exists
        }
    }


@router.get("/api/users", tags=["Users"])
def get_user_directory(current_user: dict = Depends(require_admin)):
    """Retrieves all registered user accounts for the admin user directory."""
    _pull_supabase_users_to_sqlite()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@router.get("/api/superadmin/users", tags=["Superadmin"])
def list_superadmin_users(current_superadmin: dict = Depends(require_superadmin)):
    """Retrieves all registered user accounts with role classifications."""
    _pull_supabase_users_to_sqlite()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@router.put("/api/superadmin/users/{user_id}/role", tags=["Superadmin"])
def update_user_role(user_id: int, payload: UserRoleUpdate, current_superadmin: dict = Depends(require_superadmin)):
    """Updates the role of a user account. Root superadmin account is protected."""
    target_role = payload.role.strip().lower()
    if target_role == "client":
        target_role = "user"
    if target_role not in ("user", "admin", "superadmin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'user', 'admin', or 'superadmin'.")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, email, role FROM users WHERE id = ?", (user_id,))
    target_user = cursor.fetchone()
    if not target_user:
        conn.close()
        raise HTTPException(status_code=404, detail="User account not found.")

    target_email = target_user["email"].lower().strip()

    # Protection: Root superadmin cannot be demoted
    if target_email == "urbanscope.cvsu@gmail.com" and target_role != "superadmin":
        conn.close()
        raise HTTPException(status_code=400, detail="The root Superadmin account (urbanscope.cvsu@gmail.com) cannot be demoted.")

    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (target_role, user_id))
    conn.commit()

    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?", (user_id,))
    updated_user = row_to_dict(cursor.fetchone())
    conn.close()

    if target_role == "admin":
        AUTHORIZED_ADMIN_EMAILS.add(target_email)

    _sync_update_user_to_supabase(target_email, {"role": target_role})

    return {"success": True, "message": f"Role updated to '{target_role}'", "user": updated_user}


@router.put("/api/superadmin/users/{user_id}", tags=["Superadmin"])
def superadmin_update_user(user_id: int, payload: SuperadminUpdateUser, current_superadmin: dict = Depends(require_superadmin)):
    """Modifies a user account's profile details, role, and optional password."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, email, full_name, phone, role FROM users WHERE id = ?", (user_id,))
    target_user = cursor.fetchone()
    if not target_user:
        conn.close()
        raise HTTPException(status_code=404, detail="User account not found.")

    target_email = target_user["email"].lower().strip()
    updates = []
    params = []
    cloud_patch = {}
    target_role = None

    if payload.full_name is not None and payload.full_name.strip():
        updates.append("full_name = ?")
        params.append(payload.full_name.strip())
        cloud_patch["full_name"] = payload.full_name.strip()

    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone.strip())
        cloud_patch["phone"] = payload.phone.strip()

    if payload.email is not None and payload.email.strip():
        clean_email = payload.email.strip().lower()
        if clean_email != target_email:
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", (clean_email, user_id))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(status_code=400, detail="Email is already in use by another account.")

            if target_email == "urbanscope.cvsu@gmail.com":
                conn.close()
                raise HTTPException(status_code=400, detail="The root Superadmin email address cannot be changed.")

            updates.append("email = ?")
            params.append(clean_email)
            cloud_patch["email"] = clean_email

    if payload.role is not None and payload.role.strip():
        target_role = payload.role.strip().lower()
        if target_role == "client":
            target_role = "user"
        if target_role not in ("user", "admin", "superadmin"):
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid role. Must be 'user', 'admin', or 'superadmin'.")

        if target_email == "urbanscope.cvsu@gmail.com" and target_role != "superadmin":
            conn.close()
            raise HTTPException(status_code=400, detail="The root Superadmin account cannot be demoted.")

        updates.append("role = ?")
        params.append(target_role)
        cloud_patch["role"] = target_role

    new_pwd_hash = None
    if payload.password is not None and len(payload.password.strip()) >= 6:
        new_pwd_hash = hash_password(payload.password.strip())
        updates.append("password_hash = ?")
        params.append(new_pwd_hash)
        cloud_patch["password_hash"] = new_pwd_hash
        cloud_patch["email_verified_at"] = datetime.now(timezone.utc).isoformat()

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        if target_role:
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (target_role, user_id))
        conn.commit()

    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?", (user_id,))
    updated_user = row_to_dict(cursor.fetchone())
    conn.close()

    if updated_user and updated_user.get("role") == "admin" and updated_user.get("email"):
        AUTHORIZED_ADMIN_EMAILS.add(updated_user["email"].lower().strip())

    if cloud_patch:
        _sync_update_user_to_supabase(target_email, cloud_patch)
    elif new_pwd_hash and updated_user and updated_user.get("email"):
        try:
            sync_password_to_supabase(updated_user["email"], new_pwd_hash)
        except Exception:
            pass

    return {"success": True, "message": "User account updated successfully.", "user": updated_user}


@router.post("/api/superadmin/users", tags=["Superadmin"])
def superadmin_create_user(payload: SuperadminCreateUser, current_superadmin: dict = Depends(require_superadmin)):
    """Creates a new user or admin account directly from Superadmin console."""
    clean_email = payload.email.strip().lower()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email is already registered.")

    assigned_role = payload.role.strip().lower()
    if assigned_role not in ("user", "admin", "superadmin"):
        assigned_role = "user"
    if clean_email == "urbanscope.cvsu@gmail.com":
        assigned_role = "superadmin"

    password_hash = hash_password(payload.password)
    clean_name = payload.full_name.strip()
    clean_phone = (payload.phone or "").strip()

    cursor.execute(
        "INSERT INTO users (email, password_hash, full_name, phone, role, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)",
        (clean_email, password_hash, clean_name, clean_phone, assigned_role, datetime.now(timezone.utc).isoformat())
    )
    new_id = cursor.lastrowid
    # Re-apply Superadmin's explicit role after trg_user_role_insert runs
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (assigned_role, new_id))
    conn.commit()

    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?", (new_id,))
    new_user = row_to_dict(cursor.fetchone())
    conn.close()

    if assigned_role == "admin":
        AUTHORIZED_ADMIN_EMAILS.add(clean_email)

    _sync_create_user_to_supabase(clean_email, password_hash, clean_name, clean_phone, assigned_role)

    return {"success": True, "message": "Account created successfully.", "user": new_user}


@router.delete("/api/superadmin/users/{user_id}", tags=["Superadmin"])
def delete_user_account(user_id: int, current_superadmin: dict = Depends(require_superadmin)):
    """Deletes a user account and all associated inquiry history. Root superadmin and primary admin accounts are protected."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, email, role FROM users WHERE id = ?", (user_id,))
    target_user = cursor.fetchone()
    if not target_user:
        conn.close()
        raise HTTPException(status_code=404, detail="User account not found.")

    target_email = target_user["email"].lower().strip()

    if target_email == "urbanscope.cvsu@gmail.com":
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete root Superadmin account.")

    if target_email in ("admin.realestate@gmail.com", "miriamalobren@gmail.com", "miriam@gmail.com"):
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete primary Realty Admin account.")

    # 1. Delete associated notifications
    try:
        cursor.execute(
            "DELETE FROM notifications WHERE LOWER(recipient_email) = ? OR inquiry_id IN (SELECT id FROM inquiries WHERE LOWER(client_email) = ?)",
            (target_email, target_email)
        )
    except Exception:
        pass

    # 2. Delete associated inquiries from inquiries table
    cursor.execute("DELETE FROM inquiries WHERE LOWER(client_email) = ?", (target_email,))

    # 3. Delete associated appointments & saved properties if tables exist
    try:
        cursor.execute("DELETE FROM appointments WHERE user_id = ?", (user_id,))
    except Exception:
        pass
    try:
        cursor.execute("DELETE FROM saved_properties WHERE user_id = ?", (user_id,))
    except Exception:
        pass

    # 4. Delete user record
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    _sync_delete_user_to_supabase(target_email, user_id)

    return {
        "success": True,
        "message": f"User account {target_email} and associated inquiry history deleted successfully."
    }


@router.get("/api/superadmin/integrity", tags=["Superadmin"])
def run_integrity_check(current_superadmin: dict = Depends(require_superadmin)):
    """Runs SQLite integrity and foreign-key checks and verifies the role trigger."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("PRAGMA integrity_check")
    integrity_rows = [row[0] for row in cursor.fetchall()]
    integrity_ok = integrity_rows == ["ok"]

    cursor.execute("PRAGMA foreign_key_check")
    fk_violations = len(cursor.fetchall())

    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('trg_user_role_insert', 'set_user_role_on_insert')")
    trigger_active = bool(cursor.fetchone())

    cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    table_count = cursor.fetchone()[0]

    conn.close()

    return {
        "success": integrity_ok and fk_violations == 0,
        "integrity": "ok" if integrity_ok else "; ".join(integrity_rows[:5]),
        "foreign_key_violations": fk_violations,
        "trigger_active": trigger_active,
        "table_count": table_count
    }
