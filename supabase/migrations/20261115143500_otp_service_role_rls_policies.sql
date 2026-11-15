-- ==============================================================================
-- URBANSCOPE - MIGRATION: SERVICE_ROLE POLICIES ON OTP CHALLENGE TABLES
-- ==============================================================================
-- Adds explicit `TO service_role` policies on `auth_email_challenges` and
-- `auth_email_challenge_requests` so both SECURITY DEFINER RPCs and server-side
-- `service_role` REST fallbacks work cleanly, and reloads the PostgREST schema
-- cache. Safe to replay.
-- ==============================================================================

DO $$
BEGIN
    IF to_regclass('public.auth_email_challenges') IS NOT NULL THEN
        ALTER TABLE public.auth_email_challenges ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Service role full access auth_email_challenges" ON public.auth_email_challenges;
        CREATE POLICY "Service role full access auth_email_challenges"
            ON public.auth_email_challenges
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF to_regclass('public.auth_email_challenge_requests') IS NOT NULL THEN
        ALTER TABLE public.auth_email_challenge_requests ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Service role full access auth_email_challenge_requests" ON public.auth_email_challenge_requests;
        CREATE POLICY "Service role full access auth_email_challenge_requests"
            ON public.auth_email_challenge_requests
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

