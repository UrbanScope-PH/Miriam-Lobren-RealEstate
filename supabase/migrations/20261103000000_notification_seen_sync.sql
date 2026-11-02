-- ==============================================================================
-- URBANSCOPE - MIGRATION 0008: NOTIFICATION SEEN AND CROSS-DEVICE SYNC
-- ==============================================================================
-- Adds `is_seen` column to notifications table to persist toast / alert display
-- state across devices so clients are not re-notified on multiple devices once seen.
-- Idempotent and safe to replay across local, branch, and production databases.
-- ==============================================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_seen BOOLEAN DEFAULT false;

-- Backfill existing read notifications as seen
UPDATE notifications
SET is_seen = true
WHERE is_read = true;
