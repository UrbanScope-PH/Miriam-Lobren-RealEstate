-- ==============================================================================
-- UrbanScope: track explicit user password setup status (has_password)
-- ==============================================================================
-- Accounts created via email+password registration or password reset have
-- has_password = TRUE. Accounts created directly via Google OAuth have
-- has_password = FALSE until the user adds or resets a password.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.users
SET has_password = TRUE
WHERE has_password IS NULL;

CREATE OR REPLACE FUNCTION public.protect_user_email_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
    IF session_user NOT IN ('postgres', 'supabase_admin') AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.role := 'client';
            NEW.email_verified_at := NULL;
            NEW.has_password := TRUE;
        ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Role changes must use a verified server-side account-management flow.';
        ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
            RAISE EXCEPTION 'Password changes must use a verified server-side authentication flow.';
        ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
            RAISE EXCEPTION 'Email verification must use a verified server-side authentication flow.';
        ELSIF NEW.has_password IS DISTINCT FROM OLD.has_password THEN
            RAISE EXCEPTION 'Password status changes must use a verified server-side authentication flow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_email_verification ON public.users;
CREATE TRIGGER trg_protect_user_email_verification
    BEFORE INSERT OR UPDATE OF email_verified_at, password_hash, role, has_password ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_email_verification();

NOTIFY pgrst, 'reload schema';
