-- ==============================================================================
-- Migration: 20261111120100_set_default_title_real_estate_salesperson.sql
-- Description: Standardizes the default professional role/title on users to
--              'Real Estate Salesperson' (RESA RA 9646 compliant) and normalizes
--              legacy 'Real Estate Agent' or broker titles. Idempotent and safe to replay.
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'title'
    ) THEN
        ALTER TABLE users ALTER COLUMN title SET DEFAULT 'Real Estate Salesperson';
    END IF;
END $$;

UPDATE users
SET title = 'Real Estate Salesperson'
WHERE title IS NULL
   OR TRIM(title) = ''
   OR LOWER(TRIM(title)) IN ('real estate agent', 'real estate sales person', 'licensed real estate broker / agent');

