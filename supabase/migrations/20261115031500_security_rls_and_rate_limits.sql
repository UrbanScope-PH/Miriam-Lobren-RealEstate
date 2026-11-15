-- ==============================================================================
-- URBANSCOPE - MIGRATION: STRICT RLS LOCKDOWN & DISTRIBUTED RATE LIMITING
-- ==============================================================================
-- 1. Replaces permissive `USING (true)` / `WITH CHECK (true)` RLS policies on
--    all private/transactional tables (`users`, `inquiries`, `inquiry_documents`,
--    `appointments`, `saved_properties`, `notifications`, `properties` mutations).
--    Public `anon` clients can ONLY read published public catalog tables
--    (`properties`, `property_images`). All auth, PII, user management,
--    inquiries, notifications, and catalog writes MUST execute server-side via
--    authenticated `/api/*` endpoints using `service_role`.
-- 2. Adds `security_rate_limits` table and atomic RPC `check_and_increment_rate_limit`
--    for sliding/fixed-window rate limiting across serverless Vercel invocations.
-- 3. Adds `check_auth_email_challenge` (non-consuming OTP check with max 5 attempts)
--    for multi-step registration / password reset UX verification.
-- Idempotent and safe to replay.
-- ==============================================================================

-- 1. Distributed Rate Limiting Table & Atomic RPC ------------------------------
CREATE TABLE IF NOT EXISTS public.security_rate_limits (
    bucket_key TEXT PRIMARY KEY,
    hit_count INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    blocked_until TIMESTAMPTZ
);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role rate limits" ON public.security_rate_limits;
CREATE POLICY "Service role rate limits"
    ON public.security_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.security_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
    p_bucket TEXT,
    p_limit INT DEFAULT 10,
    p_window_seconds INT DEFAULT 60,
    p_block_seconds INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    now_utc TIMESTAMPTZ := timezone('utc'::text, now());
    rec public.security_rate_limits%ROWTYPE;
BEGIN
    IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 OR length(p_bucket) > 256 THEN
        RETURN FALSE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

    SELECT * INTO rec
    FROM public.security_rate_limits
    WHERE bucket_key = p_bucket
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.security_rate_limits (bucket_key, hit_count, window_start, blocked_until)
        VALUES (p_bucket, 1, now_utc, NULL);
        RETURN TRUE;
    END IF;

    IF rec.blocked_until IS NOT NULL AND rec.blocked_until > now_utc THEN
        RETURN FALSE;
    END IF;

    IF rec.window_start + make_interval(secs => GREATEST(p_window_seconds, 1)) <= now_utc THEN
        UPDATE public.security_rate_limits
        SET hit_count = 1, window_start = now_utc, blocked_until = NULL
        WHERE bucket_key = p_bucket;
        RETURN TRUE;
    END IF;

    IF rec.hit_count >= GREATEST(p_limit, 1) THEN
        UPDATE public.security_rate_limits
        SET hit_count = rec.hit_count + 1,
            blocked_until = now_utc + make_interval(secs => GREATEST(p_block_seconds, p_window_seconds))
        WHERE bucket_key = p_bucket;
        RETURN FALSE;
    END IF;

    UPDATE public.security_rate_limits
    SET hit_count = rec.hit_count + 1
    WHERE bucket_key = p_bucket;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, INT, INT, INT) TO service_role;

-- 2. Non-Consuming OTP Pre-Check RPC (strict 5-attempt limit + expiry) ----------
CREATE OR REPLACE FUNCTION public.check_auth_email_challenge(
    p_email TEXT,
    p_purpose TEXT,
    p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    challenge public.auth_email_challenges%ROWTYPE;
BEGIN
    SELECT * INTO challenge
    FROM public.auth_email_challenges
    WHERE email = p_email AND purpose = p_purpose
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF challenge.expires_at <= timezone('utc'::text, now()) OR challenge.attempts >= 5 THEN
        DELETE FROM public.auth_email_challenges WHERE email = p_email AND purpose = p_purpose;
        RETURN FALSE;
    END IF;

    IF challenge.code_hash = p_code_hash THEN
        RETURN TRUE;
    END IF;

    UPDATE public.auth_email_challenges
    SET attempts = attempts + 1
    WHERE email = p_email AND purpose = p_purpose;
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_email_challenge(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_email_challenge(TEXT, TEXT, TEXT) TO service_role;

-- 3. Lock Down Sensitive Tables (Drop Permissive Anon/Public Policies) ----------

-- USERS: Never readable, writable, or deletable by anon/browser clients
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read users" ON public.users;
DROP POLICY IF EXISTS "Allow insert users" ON public.users;
DROP POLICY IF EXISTS "Allow update users" ON public.users;
DROP POLICY IF EXISTS "Allow delete users" ON public.users;
DROP POLICY IF EXISTS "Service role full access users" ON public.users;
CREATE POLICY "Service role full access users"
    ON public.users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- INQUIRIES: Client PII & inquiry status workflow locked to server/service_role
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow create inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Allow read inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Allow update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Allow delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Allow manage inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Service role full access inquiries" ON public.inquiries;
CREATE POLICY "Service role full access inquiries"
    ON public.inquiries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- INQUIRY DOCUMENTS: Client uploads/documents locked to server/service_role
ALTER TABLE public.inquiry_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read inquiry documents" ON public.inquiry_documents;
DROP POLICY IF EXISTS "Allow manage inquiry documents" ON public.inquiry_documents;
DROP POLICY IF EXISTS "Service role full access inquiry_documents" ON public.inquiry_documents;
CREATE POLICY "Service role full access inquiry_documents"
    ON public.inquiry_documents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- APPOINTMENTS: Tour schedules locked to server/service_role
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Service role full access appointments" ON public.appointments;
CREATE POLICY "Service role full access appointments"
    ON public.appointments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- SAVED PROPERTIES: User bookmarks locked to server/service_role
ALTER TABLE public.saved_properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow manage saved properties" ON public.saved_properties;
DROP POLICY IF EXISTS "Service role full access saved_properties" ON public.saved_properties;
CREATE POLICY "Service role full access saved_properties"
    ON public.saved_properties
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- NOTIFICATIONS: Admin/client alerts locked to server/service_role
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access notifications" ON public.notifications;
CREATE POLICY "Service role full access notifications"
    ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- PROPERTIES: Public read-only catalog; writes restricted strictly to service_role
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read properties" ON public.properties;
DROP POLICY IF EXISTS "Allow insert properties" ON public.properties;
DROP POLICY IF EXISTS "Allow update properties" ON public.properties;
DROP POLICY IF EXISTS "Allow delete properties" ON public.properties;
DROP POLICY IF EXISTS "Service role write properties" ON public.properties;
CREATE POLICY "Public read properties"
    ON public.properties
    FOR SELECT
    USING (true);
CREATE POLICY "Service role write properties"
    ON public.properties
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- PROPERTY IMAGES: Public read-only gallery; writes restricted to service_role
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read property images" ON public.property_images;
DROP POLICY IF EXISTS "Allow manage property images" ON public.property_images;
DROP POLICY IF EXISTS "Service role write property_images" ON public.property_images;
CREATE POLICY "Public read property images"
    ON public.property_images
    FOR SELECT
    USING (true);
CREATE POLICY "Service role write property_images"
    ON public.property_images
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

