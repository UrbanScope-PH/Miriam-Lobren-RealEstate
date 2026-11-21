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
            title TEXT DEFAULT 'Real Estate Salesperson',
            brokerage TEXT DEFAULT 'CD Miranda Realty',
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

    # 2b. Property Images Table (multi-photo gallery slides for listings)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS property_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
            image_url TEXT NOT NULL,
            display_order INTEGER DEFAULT 1,
            is_primary INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_property_images_prop_order ON property_images(property_id, display_order)")

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
        cursor.execute("ALTER TABLE users ADD COLUMN title TEXT DEFAULT 'Real Estate Salesperson'")
    cursor.execute("UPDATE users SET title = 'Real Estate Salesperson' WHERE title IS NULL OR title = 'Licensed Real Estate Broker / Agent' OR title = 'Real Estate Agent'")
    if "brokerage" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN brokerage TEXT DEFAULT 'CD Miranda Realty'")
    cursor.execute("UPDATE users SET brokerage = 'CD Miranda Realty' WHERE brokerage IS NULL OR brokerage = '' OR brokerage = 'UrbanScope' OR brokerage = 'UrbanScope Realty'")
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
            cancelled_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("PRAGMA table_info(inquiries)")
    existing_inq_cols = {col[1] for col in cursor.fetchall()}
    if "cancelled_by" not in existing_inq_cols:
        cursor.execute("ALTER TABLE inquiries ADD COLUMN cancelled_by TEXT")
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

    # Seed & Sync Admin Accounts with RBAC from env or one-time generated local bootstrap secrets
    from backend.auth import hash_password
    from backend.security import is_production_mode
    import secrets

    bootstrap_generated = []

    def _resolve_bootstrap_password(email: str, env_var: str) -> Optional[str]:
        val = os.environ.get(env_var, "").strip()
        if val:
            return hash_password(val)
        if is_production_mode():
            return None
        generated = secrets.token_urlsafe(12)
        bootstrap_generated.append(f"{email} ({env_var}): {generated}")
        return hash_password(generated)

    accounts_spec = [
        ("admin.realestate@gmail.com", "SEED_ADMIN_PASSWORD", "Miriam Lobren (Admin)", "+63 900 000 0000", "admin"),
        ("miriamalobren@gmail.com", "SEED_MIRIAM_PASSWORD", "Miriam Lobren", "+63 918 964 5434", "admin"),
        ("miriam@gmail.com", "SEED_ADMIN_PASSWORD", "Miriam Lobren", "+63 918 964 5434", "admin"),
        ("urbanscope.cvsu@gmail.com", "SEED_SUPERADMIN_PASSWORD", "UrbanScope Superadmin (CvSU)", "+63 900 000 0000", "superadmin"),
    ]

    for email, env_var, full_name, phone, role in accounts_spec:
        cursor.execute("SELECT id, password_hash, role FROM users WHERE LOWER(email) = LOWER(?)", (email,))
        existing = cursor.fetchone()
        if existing:
            if not existing[1]:
                pwd_hash = _resolve_bootstrap_password(email, env_var)
                if pwd_hash:
                    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, existing[0]))
            if existing[2] != role:
                cursor.execute("UPDATE users SET role = ? WHERE id = ?", (role, existing[0]))
        else:
            pwd_hash = _resolve_bootstrap_password(email, env_var)
            if pwd_hash:
                cursor.execute(
                    "INSERT INTO users (email, password_hash, full_name, phone, role, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (email, pwd_hash, full_name, phone, role, datetime.now(timezone.utc).isoformat())
                )

    if bootstrap_generated and not is_production_mode():
        creds_file = DB_PATH.parent / ".bootstrap_credentials.txt"
        try:
            existing_txt = creds_file.read_text(encoding="utf-8") if creds_file.is_file() else ""
            creds_file.write_text(existing_txt + "\n".join(bootstrap_generated) + "\n", encoding="utf-8")
            os.chmod(creds_file, 0o600)
        except OSError:
            pass

    # Demote any unauthorized user emails that may have been previously given non-client privileged roles
    cursor.execute("""
        UPDATE users
        SET role = 'user'
        WHERE LOWER(email) NOT IN ('admin.realestate@gmail.com', 'miriam@gmail.com', 'miriamalobren@gmail.com', 'urbanscope.cvsu@gmail.com')
          AND role NOT IN ('user', 'client', 'admin')
    """)
    conn.commit()
    print("✓ RBAC database schema and triggers verified.")

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
                "Kathleen - Place 5",
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
                "Kathleen - Place 5 is a secure, family-friendly residential community offering 275 premium townhouses in Molino VII, Bacoor, Cavite (border Las Pinas). Just 12 minutes from EVIA Lifestyle Center along Daang-Hari and MCX. This development features zen-inspired 2-storey townhouses with complete finishes including steel gates and modular cabinets in all rooms. The project offers quality units built to last, located in a thriving community with easy access to shopping centers, schools, hospitals, and major thoroughfares.",
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
            ),
            (
                "Benecia Single-Attached",
                "Sihanouk Village, Barangay Talon IV, Las Piñas City",
                "Single-Attached House",
                9695000.0,
                3,
                3,
                102.0,
                117.0,
                1,
                2,
                "Available",
                "assets/images/benecia-facade.jpg",
                "Benecia Single Attached offers a modern and spacious home designed for families looking for comfort, privacy, and functionality. Located in Sihanouk Village, Barangay Talon IV, Las Piñas City, this property provides a practical residential setting with convenient access to surrounding establishments and main roads. Complete turnover with front fence and gate.",
                "Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Functional Multi-Level Living Spaces, Spacious Indoor Living Areas, Maid's Room, Powder Room"
            ),
            (
                "Amore Classico",
                "Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City",
                "Townhouse",
                7995000.0,
                3,
                3,
                52.0,
                102.0,
                1,
                3,
                "Available",
                "assets/images/amore-facade.jpg",
                "Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse ideal for growing families who need more space, comfort, and functionality. Located in Barangay Pulang Lupa Uno, Las Piñas City, offering functional multi-level living with family hall and private patio.",
                "Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid's Room, Functional Multi-Level Living Spaces, Private Patio, Powder Room"
            ),
            (
                "Midori Mid-Rise Condo – Zone 1",
                "Zone 1, Buildings 14–21, Dasmariñas, Cavite",
                "Mid-Rise Condominium",
                3140000.0,
                2,
                1,
                0.0,
                50.0,
                0,
                2,
                "Available",
                "assets/images/midori-main.webp",
                "Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite. Each 50 sqm unit features two bedrooms, a toilet and bath, a living area, a dining and kitchen area, and a patio, with Inner and End unit options.",
                "2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs"
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
        print("✓ Database seeded with 7 accredited featured properties")
    else:
        # Idempotently sync newly added accredited properties on existing SQLite DBs
        canonical_additions = [
            (
                "Benecia",
                (
                    "Benecia Single-Attached",
                    "Sihanouk Village, Barangay Talon IV, Las Piñas City",
                    "Single-Attached House",
                    9695000.0,
                    3,
                    3,
                    102.0,
                    117.0,
                    1,
                    2,
                    "Available",
                    "assets/images/benecia-facade.jpg",
                    "Benecia Single Attached offers a modern and spacious home designed for families looking for comfort, privacy, and functionality. Located in Sihanouk Village, Barangay Talon IV, Las Piñas City, this property provides a practical residential setting with convenient access to surrounding establishments and main roads. Complete turnover with front fence and gate.",
                    "Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Functional Multi-Level Living Spaces, Spacious Indoor Living Areas, Maid's Room, Powder Room"
                )
            ),
            (
                "Amore",
                (
                    "Amore Classico",
                    "Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City",
                    "Townhouse",
                    7995000.0,
                    3,
                    3,
                    52.0,
                    102.0,
                    1,
                    3,
                    "Available",
                    "assets/images/amore-facade.jpg",
                    "Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse ideal for growing families who need more space, comfort, and functionality. Located in Barangay Pulang Lupa Uno, Las Piñas City, offering functional multi-level living with family hall and private patio.",
                    "Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid's Room, Functional Multi-Level Living Spaces, Private Patio, Powder Room"
                )
            ),
            (
                "Midori",
                (
                    "Midori Mid-Rise Condo – Zone 1",
                    "Zone 1, Buildings 14–21, Dasmariñas, Cavite",
                    "Mid-Rise Condominium",
                    3140000.0,
                    2,
                    1,
                    0.0,
                    50.0,
                    0,
                    2,
                    "Available",
                    "assets/images/midori-main.webp",
                    "Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite. Each 50 sqm unit features two bedrooms, a toilet and bath, a living area, a dining and kitchen area, and a patio, with Inner and End unit options.",
                    "2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs"
                )
            )
        ]
        for match_key, row_vals in canonical_additions:
            cursor.execute("SELECT id FROM properties WHERE LOWER(title) LIKE ? LIMIT 1", (f"%{match_key.lower()}%",))
            if cursor.fetchone() is None:
                cursor.execute("""
                    INSERT INTO properties (
                        title, location, property_type, price,
                        bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
                        status, image_url, description, amenities
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, row_vals)
        # Keep accredited display titles & RFO removals synchronized on existing SQLite DBs
        cursor.execute("""
            UPDATE properties
            SET title = 'Kathleen - Place 5',
                description = REPLACE(description, 'Kathleen is a secure', 'Kathleen - Place 5 is a secure')
            WHERE LOWER(title) LIKE '%kathleen%'
              AND title != 'Kathleen - Place 5'
        """)
        cursor.execute("""
            UPDATE properties
            SET amenities = 'Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Functional Multi-Level Living Spaces, Spacious Indoor Living Areas, Maid''s Room, Powder Room'
            WHERE LOWER(title) LIKE '%benecia%'
              AND LOWER(COALESCE(amenities, '')) LIKE '%rfo%'
        """)
        cursor.execute("""
            UPDATE properties
            SET amenities = 'Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid''s Room, Functional Multi-Level Living Spaces, Private Patio, Powder Room'
            WHERE LOWER(title) LIKE '%amore%'
              AND LOWER(COALESCE(amenities, '')) LIKE '%rfo%'
        """)
        conn.commit()

    # Inquiries table is ready for client submissions

    conn.close()


def row_to_dict(row: sqlite3.Row) -> dict:
    """Converts a SQLite Row object to a standard Python dictionary."""
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}
