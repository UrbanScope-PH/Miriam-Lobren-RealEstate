-- ==============================================================================
-- UrbanScope: store linked Gmail address (google_email) for Google OAuth
-- ==============================================================================
-- Allows users who signed up with a non-Google email (e.g. Yahoo, Outlook) or
-- existing email/password accounts to link a Google account and sign in with it,
-- while surfacing connection status and the linked Gmail in Profile & Security.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS google_email TEXT;

UPDATE public.users
SET google_email = LOWER(email)
WHERE google_id IS NOT NULL
  AND (google_email IS NULL OR TRIM(google_email) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_email
    ON public.users (LOWER(google_email))
    WHERE google_email IS NOT NULL AND TRIM(google_email) <> '';

CREATE OR REPLACE FUNCTION public.protect_user_email_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
    IF NOT pg_has_role(session_user, 'postgres', 'MEMBER')
       AND session_user NOT IN ('postgres', 'supabase_admin')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.role := 'client';
            NEW.email_verified_at := NULL;
            NEW.has_password := TRUE;
            NEW.google_id := NULL;
            NEW.google_email := NULL;
        ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Role changes must use a verified server-side account-management flow.';
        ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
            RAISE EXCEPTION 'Password changes must use a verified server-side authentication flow.';
        ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
            RAISE EXCEPTION 'Email verification must use a verified server-side authentication flow.';
        ELSIF NEW.has_password IS DISTINCT FROM OLD.has_password THEN
            RAISE EXCEPTION 'Password status changes must use a verified server-side authentication flow.';
        ELSIF NEW.google_id IS DISTINCT FROM OLD.google_id THEN
            RAISE EXCEPTION 'Google account linking must use a verified server-side authentication flow.';
        ELSIF NEW.google_email IS DISTINCT FROM OLD.google_email THEN
            RAISE EXCEPTION 'Google account linking must use a verified server-side authentication flow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_email_verification ON public.users;
CREATE TRIGGER trg_protect_user_email_verification
    BEFORE INSERT OR UPDATE OF email_verified_at, password_hash, role, has_password, google_id, google_email ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_email_verification();

NOTIFY pgrst, 'reload schema';
