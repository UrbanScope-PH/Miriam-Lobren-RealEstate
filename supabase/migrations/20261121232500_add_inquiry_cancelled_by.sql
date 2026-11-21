-- ============================================================================
-- Migration: 20261121232500_add_inquiry_cancelled_by.sql
-- Purpose: Track whether a cancelled inquiry was cancelled by the client or
--          by an administrator so admin and client portals display accurate
--          cancellation attribution ("Cancelled by Client" vs "Cancelled by Admin").
-- ============================================================================

ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inquiries_cancelled_by_check'
    ) THEN
        ALTER TABLE public.inquiries
            ADD CONSTRAINT inquiries_cancelled_by_check
            CHECK (cancelled_by IS NULL OR cancelled_by IN ('client', 'admin'));
    END IF;
END $$;
