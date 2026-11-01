-- ==============================================================================
-- URBANSCOPE - MIGRATION 0003: UPDATE DEFAULT BROKERAGE TO URBANSCOPE
-- ==============================================================================
-- Updates the `users.brokerage` column default to 'UrbanScope' and normalizes
-- any existing legacy default brokerage values. Idempotent and safe to replay.
-- ==============================================================================

ALTER TABLE users ALTER COLUMN brokerage SET DEFAULT 'UrbanScope';

UPDATE users
SET brokerage = 'UrbanScope'
WHERE brokerage IS NULL
   OR (LOWER(TRIM(brokerage)) LIKE 'cd %' AND LOWER(TRIM(brokerage)) LIKE '%realty%');
