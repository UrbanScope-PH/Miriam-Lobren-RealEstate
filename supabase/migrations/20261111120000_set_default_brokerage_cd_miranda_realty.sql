-- ==============================================================================
-- Migration: 20261111120000_set_default_brokerage_cd_miranda_realty.sql
-- Description: Standardizes the default brokerage on users to 'CD Miranda Realty'
--              and normalizes legacy 'UrbanScope'/'UrbanScope Realty' brokerage values.
--              Idempotent and safe to replay.
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'brokerage'
    ) THEN
        ALTER TABLE users ALTER COLUMN brokerage SET DEFAULT 'CD Miranda Realty';
    END IF;
END $$;

UPDATE users
SET brokerage = 'CD Miranda Realty'
WHERE brokerage IS NULL
   OR TRIM(brokerage) = ''
   OR LOWER(TRIM(brokerage)) IN ('urbanscope', 'urbanscope realty', 'cdmiranda realty');

