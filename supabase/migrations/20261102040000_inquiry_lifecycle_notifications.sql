-- ==============================================================================
-- URBANSCOPE - MIGRATION 0006: INQUIRY LIFECYCLE NOTIFICATIONS
-- ==============================================================================
-- Treats database evolution as atomic, linear git history.
-- Extends `notifications` to support inquiry lifecycle alerts between clients
-- and administrators (cancellation/deletion notifications for admin, approval
-- notifications for clients) with optional `user_id` and email/role targeting.
-- Idempotent and safe to replay across local, branch, and production databases.
-- ==============================================================================

ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_role TEXT DEFAULT 'admin';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_email TEXT DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS inquiry_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS property_title TEXT DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT '';

