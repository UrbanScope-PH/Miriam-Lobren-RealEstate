#!/usr/bin/env python3
"""
UrbanScope - RBAC Seed & Migration Script
==================================================
Initializes Role-Based Access Control schema, email triggers,
and verifies authorized admin and superadmin accounts without
storing plaintext credentials in source code.
"""

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import get_db_connection, init_db
from backend.auth import verify_password


def run_rbac_migration():
    print("=" * 60)
    print(" 🛡️  URBANSCOPE RBAC SEED & MIGRATION")
    print("=" * 60)

    conn = get_db_connection()
    cursor = conn.cursor()

    print("1. Initializing schema and triggers...")
    init_db()

    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_user_role_%'")
    triggers = cursor.fetchall()
    for name, _ in triggers:
        print(f"   ✓ Trigger active: {name}")

    print("\n2. Verifying staff accounts & roles in database:")
    cursor.execute(
        "SELECT id, email, full_name, role, password_hash FROM users WHERE LOWER(role) IN ('admin', 'superadmin') ORDER BY id ASC"
    )
    users = cursor.fetchall()

    for u in users:
        u_id, email, full_name, role, pwd_hash = u
        env_pass = None
        if email == "urbanscope.cvsu@gmail.com":
            env_pass = os.environ.get("SEED_SUPERADMIN_PASSWORD", "").strip() or None
        elif email == "miriamalobren@gmail.com":
            env_pass = os.environ.get("SEED_MIRIAM_PASSWORD", "").strip() or None
        elif email in ("admin.realestate@gmail.com", "miriam@gmail.com"):
            env_pass = os.environ.get("SEED_ADMIN_PASSWORD", "").strip() or None

        has_hash = bool(pwd_hash and "$" in str(pwd_hash))
        pass_status = verify_password(env_pass, pwd_hash) if env_pass else ("hash present" if has_hash else "missing hash")
        print(f"   [{role.upper():10}] ID: {u_id:2} | Email: {email:30} | Name: {full_name:30} | Password check: {pass_status}")

    conn.close()
    print("\n✓ RBAC setup completed successfully!\n")


if __name__ == "__main__":
    run_rbac_migration()
