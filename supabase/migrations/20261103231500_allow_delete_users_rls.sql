-- ==============================================================================
-- URBANSCOPE - MIGRATION 0009: ALLOW DELETE USERS RLS POLICY
-- ==============================================================================
-- Enables Superadmin account deletion on the `users` table in Supabase Cloud.
-- Previously, `users` had SELECT, INSERT, and UPDATE RLS policies, but lacked
-- a DELETE policy, causing REST `DELETE /rest/v1/users` calls from the
-- Superadmin Console to match 0 rows under Row Level Security.
-- Also purges any soft-deleted user placeholders created prior to applying
-- this migration.
-- ==============================================================================

DROP POLICY IF EXISTS "Allow delete users" ON users;
CREATE POLICY "Allow delete users" ON users FOR DELETE USING (true);

DELETE FROM users WHERE bio = '__URBANSCOPE_DELETED__';

