-- ==============================================================================
-- UrbanScope: Enforce Single-Admin Policy (miriamalobren@gmail.com)
-- ==============================================================================
-- Ensures miriamalobren@gmail.com is the sole Realty Administrator ('admin'),
-- demotes all other admin/superadmin/agent accounts to 'user', re-points
-- property ownership to the main administrator, and enforces single-admin role
-- assignment via an idempotent Postgres trigger on public.users.
-- ==============================================================================

-- 0. Ensure Supabase CLI login roles (`pg_has_role(..., 'postgres', 'MEMBER')`) can run migrations
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
        ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Role changes must use a verified server-side account-management flow.';
        ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
            RAISE EXCEPTION 'Password changes must use a verified server-side authentication flow.';
        ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
            RAISE EXCEPTION 'Email verification must use a verified server-side authentication flow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 1. Ensure miriamalobren@gmail.com holds the 'admin' role and verified status
UPDATE public.users
SET
    role = 'admin',
    email_verified_at = COALESCE(email_verified_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
WHERE LOWER(BTRIM(email)) = 'miriamalobren@gmail.com'
  AND (role IS DISTINCT FROM 'admin' OR email_verified_at IS NULL);

-- 2. Demote all other privileged accounts (including legacy staff/superadmin)
UPDATE public.users
SET
    role = 'user',
    updated_at = timezone('utc'::text, now())
WHERE LOWER(BTRIM(email)) <> 'miriamalobren@gmail.com'
  AND LOWER(COALESCE(role, '')) IN ('admin', 'superadmin', 'agent');

-- 3. Ensure all properties point to Miriam Lobren's admin account if mismatched
DO $$
DECLARE
    v_admin_id BIGINT;
BEGIN
    SELECT id INTO v_admin_id
    FROM public.users
    WHERE LOWER(BTRIM(email)) = 'miriamalobren@gmail.com'
    ORDER BY id ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
        UPDATE public.properties
        SET agent_id = v_admin_id
        WHERE agent_id IS NULL
           OR agent_id IN (
               SELECT id FROM public.users WHERE LOWER(BTRIM(email)) <> 'miriamalobren@gmail.com'
           );
    END IF;
END;
$$;

-- 4. Trigger enforcement: lock 'admin' exclusively to miriamalobren@gmail.com
CREATE OR REPLACE FUNCTION public.enforce_single_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF LOWER(BTRIM(COALESCE(NEW.email, ''))) = 'miriamalobren@gmail.com' THEN
        NEW.role := 'admin';
    ELSIF LOWER(COALESCE(NEW.role, 'user')) IN ('admin', 'superadmin', 'agent') THEN
        NEW.role := 'user';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_admin_role ON public.users;
CREATE TRIGGER trg_enforce_single_admin_role
    BEFORE INSERT OR UPDATE OF email, role ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_admin_role();
