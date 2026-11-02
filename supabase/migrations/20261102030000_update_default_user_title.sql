-- ==============================================================================
-- Migration: 20261102030000_update_default_user_title.sql
-- Description: Standardizes the default professional role/title on users to
--              'Real Estate Agent' and normalizes legacy broker/agent strings.
-- ==============================================================================

-- 1. Alter users title column default to 'Real Estate Agent'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'title'
    ) THEN
        ALTER TABLE users ALTER COLUMN title SET DEFAULT 'Real Estate Agent';
    END IF;
END $$;

-- 2. Normalize existing user accounts with legacy placeholder title or null
UPDATE users
SET title = 'Real Estate Agent'
WHERE title IS NULL OR title = 'Licensed Real Estate Broker / Agent';
