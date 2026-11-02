"""
UrbanScope - User Directory & Superadmin Executive Governance Router
Handles user management, RBAC role updates, executive metrics, and SQLite diagnostics.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import hash_password, require_admin, require_superadmin
from backend.database import DB_PATH, get_db_connection, row_to_dict
from backend.models import SuperadminCreateUser, SuperadminUpdateUser, UserRoleUpdate

router = APIRouter()


# ==========================================================
# SUPERADMIN EXECUTIVE & USER DIRECTORY ENDPOINTS
# ==========================================================

@router.get("/api/superadmin/overview", tags=["Superadmin"])
def get_superadmin_overview(current_superadmin: dict = Depends(require_superadmin)):
    """Executive overview with master counts, database metrics, and system status."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # User counts by role
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")
    superadmin_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    admin_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'user'")
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
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@router.get("/api/superadmin/users", tags=["Superadmin"])
def list_superadmin_users(current_superadmin: dict = Depends(require_superadmin)):
    """Retrieves all registered user accounts with role classifications."""
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
    target_role = None

    if payload.full_name is not None and payload.full_name.strip():
        updates.append("full_name = ?")
        params.append(payload.full_name.strip())

    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone.strip())

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

    if payload.role is not None and payload.role.strip():
        target_role = payload.role.strip().lower()
        if target_role not in ("user", "admin", "superadmin"):
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid role. Must be 'user', 'admin', or 'superadmin'.")

        if target_email == "urbanscope.cvsu@gmail.com" and target_role != "superadmin":
            conn.close()
            raise HTTPException(status_code=400, detail="The root Superadmin account cannot be demoted.")

        updates.append("role = ?")
        params.append(target_role)

    if payload.password is not None and len(payload.password.strip()) >= 6:
        updates.append("password_hash = ?")
        params.append(hash_password(payload.password.strip()))

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        if target_role:
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (target_role, user_id))
        conn.commit()

    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?", (user_id,))
    updated_user = row_to_dict(cursor.fetchone())
    conn.close()

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

    password_hash = hash_password(payload.password)
    cursor.execute(
        "INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?)",
        (clean_email, password_hash, payload.full_name.strip(), payload.phone.strip(), assigned_role)
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.execute("SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?", (new_id,))
    new_user = row_to_dict(cursor.fetchone())
    conn.close()

    return {"success": True, "message": "Account created successfully.", "user": new_user}


@router.delete("/api/superadmin/users/{user_id}", tags=["Superadmin"])
def delete_user_account(user_id: int, current_superadmin: dict = Depends(require_superadmin)):
    """Deletes a user account. Root superadmin and primary admin accounts are protected."""
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

    if target_email == "admin.realestate@gmail.com":
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete primary Realty Admin account.")

    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": f"User account {target_email} deleted successfully."}


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
