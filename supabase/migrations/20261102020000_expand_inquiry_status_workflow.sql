-- ==============================================================================
-- URBANSCOPE - MIGRATION 0004: EXPAND INQUIRY STATUS WORKFLOW
-- ==============================================================================
-- Treats database evolution as atomic, linear git history.
-- Updates the `inquiries.status` CHECK constraint to include all active CRM
-- workflow statuses used by Admin Inquiries and Client History modules:
-- ('Submitted', 'Requirements Submitted', 'Under Review', 'For Resubmission',
--  'Approved', 'Scheduled', 'Contacted', 'Completed', 'Closed', 'Cancelled', 'Pending').
-- Idempotent and safe to replay across local, branch, and production databases.
-- ==============================================================================

ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE inquiries
    ADD CONSTRAINT inquiries_status_check
    CHECK (status IN (
        'Submitted',
        'Requirements Submitted',
        'Under Review',
        'For Resubmission',
        'Approved',
        'Scheduled',
        'Contacted',
        'Completed',
        'Closed',
        'Cancelled',
        'Pending'
    ));
