"""
UrbanScope - Database Configuration & SQLite Driver
Provides schema initialization, seed data, and connection management.
"""

import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import Generator

import unicodedata

# Database file location
DB_DIR = Path(__file__).resolve().parent
DB_PATH = DB_DIR / "urbanscope.db"

def normalize_text(val) -> str:
    """Normalizes string for search: removes accents/diacritics, hyphens, and whitespace."""
    if not val:
        return ""
    # Strip diacritics / accents (e.g. ñ -> n, é -> e)
    s = ''.join(c for c in unicodedata.normalize('NFD', str(val)) if unicodedata.category(c) != 'Mn')
    return s.replace('-', ' ').replace('_', ' ').lower().strip()


def determine_user_role(email: str) -> str:
    """
    Automatic database role detection:
    - admin.realestate@gmail.com / miriamalobren@gmail.com / miriam@gmail.com -> 'admin'
    - urbanscope.cvsu@gmail.com -> 'superadmin'
    - all other emails -> 'user'
    """
    clean = (email or "").strip().lower()
    if clean in ("admin.realestate@gmail.com", "miriamalobren@gmail.com", "miriam@gmail.com"):
        return "admin"
    elif clean == "urbanscope.cvsu@gmail.com":
        return "superadmin"
    return "user"


def get_db_connection() -> sqlite3.Connection:
    """Creates a database connection with dictionary-like row access and search normalization."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.create_function("NORMALIZE", 1, normalize_text)
    return conn


def init_db():
    """Initializes SQLite schema, triggers, and populates seed records."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users Table with role ENUM / CHECK constraint
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            phone TEXT,
            role TEXT CHECK(role IN ('user', 'admin', 'superadmin')) DEFAULT 'user',
            avatar_url TEXT DEFAULT 'assets/images/agent.jpg',
            google_id TEXT,
            license_number TEXT DEFAULT '',
            title TEXT DEFAULT 'Real Estate Agent',
            brokerage TEXT DEFAULT 'UrbanScope',
            bio TEXT DEFAULT '',
            email_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Triggers for automatic role enforcement upon insertion or email update
    cursor.execute("DROP TRIGGER IF EXISTS trg_user_role_insert")
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_user_role_insert
        AFTER INSERT ON users
        BEGIN
            UPDATE users
            SET role = CASE
                WHEN LOWER(NEW.email) IN ('admin.realestate@gmail.com', 'miriamalobren@gmail.com', 'miriam@gmail.com') THEN 'admin'
                WHEN LOWER(NEW.email) = 'urbanscope.cvsu@gmail.com' THEN 'superadmin'
                ELSE 'user'
            END
            WHERE id = NEW.id;
        END;
    """)

    cursor.execute("DROP TRIGGER IF EXISTS trg_user_role_update")
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_user_role_update
        AFTER UPDATE OF email ON users
        BEGIN
            UPDATE users
            SET role = CASE
                WHEN LOWER(NEW.email) IN ('admin.realestate@gmail.com', 'miriamalobren@gmail.com', 'miriam@gmail.com') THEN 'admin'
                WHEN LOWER(NEW.email) = 'urbanscope.cvsu@gmail.com' THEN 'superadmin'
                ELSE OLD.role
            END
            WHERE id = NEW.id;
        END;
    """)

    # 2. Properties Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            location TEXT NOT NULL,
            property_type TEXT NOT NULL,
            price REAL NOT NULL,
            bedrooms INTEGER DEFAULT 3,
            bathrooms INTEGER DEFAULT 2,
            lot_area REAL DEFAULT 120,
            floor_area REAL DEFAULT 80,
            carports INTEGER DEFAULT 1,
            storeys INTEGER DEFAULT 2,
            status TEXT DEFAULT 'Available',
            image_url TEXT,
            description TEXT,
            amenities TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Non-destructive column migrations for existing databases
    cursor.execute("PRAGMA table_info(properties)")
    existing_cols = {col[1] for col in cursor.fetchall()}
    if "floor_area" not in existing_cols:
        cursor.execute("ALTER TABLE properties ADD COLUMN floor_area REAL DEFAULT 80")
    if "carports" not in existing_cols:
        cursor.execute("ALTER TABLE properties ADD COLUMN carports INTEGER DEFAULT 1")
    if "storeys" not in existing_cols:
        cursor.execute("ALTER TABLE properties ADD COLUMN storeys INTEGER DEFAULT 2")
    if "amenities" not in existing_cols:
        cursor.execute("ALTER TABLE properties ADD COLUMN amenities TEXT DEFAULT ''")

    cursor.execute("PRAGMA table_info(users)")
    existing_user_cols = {col[1] for col in cursor.fetchall()}
    if "email_verified_at" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP")
        cursor.execute("UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP)")
    if "avatar_url" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT 'assets/images/agent.jpg'")
    if "google_id" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
    if "license_number" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN license_number TEXT DEFAULT ''")
    if "title" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN title TEXT DEFAULT 'Real Estate Agent'")
    cursor.execute("UPDATE users SET title = 'Real Estate Agent' WHERE title IS NULL OR title = 'Licensed Real Estate Broker / Agent'")
    if "brokerage" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN brokerage TEXT DEFAULT 'UrbanScope'")
    cursor.execute("UPDATE users SET brokerage = 'UrbanScope' WHERE brokerage IS NULL OR (LOWER(brokerage) LIKE 'cd %' AND LOWER(brokerage) LIKE '%realty%')")
    if "bio" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL")
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_users_email_verified_default
        AFTER INSERT ON users
        WHEN NEW.email_verified_at IS NULL
        BEGIN
            UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
    """)

    # Email OTP state is separate from account records; only HMAC digests are stored.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_email_challenges (
            email TEXT NOT NULL,
            purpose TEXT NOT NULL CHECK (purpose IN ('register', 'password_reset')),
            code_hash TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (email, purpose)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_email_challenge_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_challenge_requests_ip_time ON auth_email_challenge_requests(ip_hash, created_at)")

    # 3. Inquiries Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_title TEXT,
            client_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            client_phone TEXT,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'Under Review',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("PRAGMA table_info(inquiries)")
    existing_inq_cols = {col[1] for col in cursor.fetchall()}
    if "updated_at" not in existing_inq_cols:
        cursor.execute("ALTER TABLE inquiries ADD COLUMN updated_at TIMESTAMP")
        cursor.execute("UPDATE inquiries SET updated_at = created_at WHERE updated_at IS NULL")

    # 4. Notifications Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_role TEXT DEFAULT 'admin',
            recipient_email TEXT DEFAULT '',
            type TEXT DEFAULT 'info',
            inquiry_id INTEGER,
            property_title TEXT DEFAULT '',
            client_name TEXT DEFAULT '',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            is_seen INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("PRAGMA table_info(notifications)")
    existing_notif_cols = {col[1] for col in cursor.fetchall()}
    if "is_seen" not in existing_notif_cols:
        cursor.execute("ALTER TABLE notifications ADD COLUMN is_seen INTEGER DEFAULT 0")
        cursor.execute("UPDATE notifications SET is_seen = 1 WHERE is_read = 1")

    conn.commit()

    # Seed & Sync Admin Accounts with RBAC (admin.realestate@gmail.com, urbanscope.cvsu@gmail.com)
    from backend.auth import hash_password

    admin_pass = hash_password("realestate2026")
    miriam_pass = "44642fa6779150106462e64ac546bbd4$8702f1df11fd794ec0394fb4d7339b0f5e86a37652e80dabf6aa21c40351b20c"  # 111112
    superadmin_pass = hash_password("urbanscope2026")

    accounts_to_sync = [
        ("admin.realestate@gmail.com", admin_pass, "Miriam Lobren (Admin)", "+63 900 000 0000", "admin"),
        ("miriamalobren@gmail.com", miriam_pass, "Miriam Lobren", "+63 918 964 5434", "admin"),
        ("miriam@gmail.com", admin_pass, "Miriam Lobren", "09123456789", "admin"),
        ("urbanscope.cvsu@gmail.com", superadmin_pass, "UrbanScope Superadmin (CvSU)", "+63 900 000 0000", "superadmin")
    ]

    for email, pwd_hash, full_name, phone, role in accounts_to_sync:
        cursor.execute("SELECT id, password_hash, role FROM users WHERE LOWER(email) = LOWER(?)", (email,))
        existing = cursor.fetchone()
        if existing:
            # Preserve existing user's password and profile updates; ensure proper RBAC role
            if not existing[1]:
                cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, existing[0]))
            if existing[2] != role:
                cursor.execute("UPDATE users SET role = ? WHERE id = ?", (role, existing[0]))
        else:
            cursor.execute(
                "INSERT INTO users (email, password_hash, full_name, phone, role, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)",
                (email, pwd_hash, full_name, phone, role, datetime.now(timezone.utc).isoformat())
            )

    # Demote any unauthorized user emails that may have been previously given admin role
    cursor.execute("""
        UPDATE users
        SET role = 'user'
        WHERE LOWER(email) NOT IN ('admin.realestate@gmail.com', 'miriam@gmail.com', 'miriamalobren@gmail.com', 'urbanscope.cvsu@gmail.com')
          AND role NOT IN ('user', 'client', 'admin')
    """)
    conn.commit()
    print("✓ RBAC credentials & database triggers verified (Superadmin: urbanscope.cvsu@gmail.com, Admin: miriamalobren@gmail.com / miriam@gmail.com / admin.realestate@gmail.com)")

    # Purge legacy @example.com demo rows left behind by databases seeded before they were removed
    cursor.execute("DELETE FROM inquiries WHERE LOWER(client_email) LIKE '%@example.com'")
    purged_inquiries = cursor.rowcount
    cursor.execute("DELETE FROM users WHERE LOWER(email) LIKE '%@example.com'")
    purged_users = cursor.rowcount
    conn.commit()
    if purged_users or purged_inquiries:
        print(f"✓ Purged legacy demo data: {purged_users} @example.com user(s), {purged_inquiries} inquiry(ies)")

    # Seed Initial Properties
    cursor.execute("SELECT COUNT(*) FROM properties")
    prop_count = cursor.fetchone()[0]
    if prop_count == 0:
        properties_seed = [
            (
                "Casasuerte",
                "Barangay San Agustin, Trece Martires City, Cavite",
                "Townhouse",
                2500000.0,
                2,
                1,
                50.0,
                50.8,
                1,
                2,
                "Available",
                "assets/images/casasuerte.jpg",
                "Casasuerte stands out as an attractive option for first-time homebuyers and modern families looking for a sustainable yet affordable home. The neighborhood is meticulously designed to support a growing community, featuring concrete, well-paved roads, a secured entrance gate, and pocket parks. Its standout selling point is that its units come equipped with a built-in solar power system, offering permanent, eco-friendly savings on monthly electricity bills.",
                "Gated Entrance, Clubhouse, Basketball Court, Parks & Playgrounds, Built-in Solar Power System, Paved Concrete Roads"
            ),
            (
                "Kathleen",
                "Molino 7, Bacoor, Cavite",
                "Townhouse",
                6200000.0,
                3,
                2,
                112.0,
                112.0,
                1,
                2,
                "Available",
                "assets/images/kathleen-facade.jpg",
                "Kathleen is a secure, family-friendly residential community offering 275 premium townhouses in Molino VII, Bacoor, Cavite (border Las Pinas). Just 12 minutes from EVIA Lifestyle Center along Daang-Hari and MCX. This development features zen-inspired 2-storey townhouses with complete finishes including steel gates and modular cabinets in all rooms. The project offers quality units built to last, located in a thriving community with easy access to shopping centers, schools, hospitals, and major thoroughfares.",
                "Gated Entrance, Clubhouse, Park, Basketball Court, CCTV, Green-Oriented Community, Steel Gates Included, Modular Cabinets"
            ),
            (
                "Liora Homes",
                "Brgy. Malainen Bago, Naic, Cavite",
                "Townhouse",
                2462400.0,
                2,
                1,
                50.0,
                44.0,
                1,
                2,
                "Available",
                "assets/images/LioraHomes.jpg",
                "Liora Homes Naic represents the next generation of housing developments by CBDI. Located in Brgy. Malainen Bago, Naic, Cavite, its 3,345 Amora EcoLove townhomes are equipped with solar panel systems and rainwater storage tanks, awarded 3 Stars by PHILGBC under the BERDE program.",
                "Clubhouse, Covered Basketball Court, Swimming Pool, Playground & Park, Solar-Ready System, Rainwater Harvesting"
            ),
            (
                "Airmen's Village Triplex",
                "Pulang Lupa Dos, Las Piñas City",
                "Triplex",
                8900000.0,
                3,
                3,
                83.25,
                143.78,
                2,
                2,
                "Available",
                "assets/images/AirmenTriplex.WEBP",
                "This modern, Ready-for-Occupancy (RFO) triplex townhouse offers the perfect blend of space, comfort, and accessibility. Located in a secure and peaceful community in Las Piñas, it is highly accessible to major roads, commercial hubs, schools, and airports.",
                "Clubhouse, Basketball Court, Swimming Pool, Playground & Park, 24/7 Security, Balcony"
            )
        ]

        cursor.executemany("""
            INSERT INTO properties (
                title, location, property_type, price,
                bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
                status, image_url, description, amenities
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, properties_seed)
        conn.commit()
        print("✓ Database seeded with 4 accredited featured properties")

    # Inquiries table is ready for client submissions

    conn.close()


def row_to_dict(row: sqlite3.Row) -> dict:
    """Converts a SQLite Row object to a standard Python dictionary."""
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}
