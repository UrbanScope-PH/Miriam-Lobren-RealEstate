-- ==============================================================================
-- URBANSCOPE RBAC MIGRATION & TRIGGER SCRIPT
-- Enforces automatic role detection and seeds authorized admin credentials.
-- ==============================================================================

-- 1. Ensure users table exists with role CHECK constraint
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT CHECK(role IN ('user', 'admin', 'superadmin')) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trigger on INSERT: automatically sets role based strictly on single-admin policy
DROP TRIGGER IF EXISTS trg_user_role_insert;
CREATE TRIGGER IF NOT EXISTS trg_user_role_insert
AFTER INSERT ON users
BEGIN
    UPDATE users
    SET role = CASE
        WHEN LOWER(NEW.email) = 'miriamalobren@gmail.com' THEN 'admin'
        ELSE 'user'
    END
    WHERE id = NEW.id;
END;

-- 3. Trigger on UPDATE OF email: automatically enforces single-admin role on email change
DROP TRIGGER IF EXISTS trg_user_role_update;
CREATE TRIGGER IF NOT EXISTS trg_user_role_update
AFTER UPDATE OF email ON users
BEGIN
    UPDATE users
    SET role = CASE
        WHEN LOWER(NEW.email) = 'miriamalobren@gmail.com' THEN 'admin'
        ELSE 'user'
    END
    WHERE id = NEW.id;
END;

-- 4. Enforce single-admin invariant: only miriamalobren@gmail.com holds 'admin'
UPDATE users
SET role = 'user'
WHERE LOWER(email) != 'miriamalobren@gmail.com';
UPDATE users
SET role = 'admin'
WHERE LOWER(email) = 'miriamalobren@gmail.com';
