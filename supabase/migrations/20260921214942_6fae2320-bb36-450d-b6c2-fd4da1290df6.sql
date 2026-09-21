-- 1. Admin-check helper no longer needs elevated privileges.
DROP POLICY IF EXISTS "Users see own admin row" ON public.admin_users;
DROP POLICY IF EXISTS "Admins manage admins" ON public.admin_users;

CREATE POLICY "Own admin row read" ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id);
$$;

-- 2. Session bootstrap runs as the caller and can no longer grant access.
DROP FUNCTION IF EXISTS public.bootstrap_current_user();

CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  uid UUID := auth.uid();
  mail TEXT := coalesce(auth.jwt() ->> 'email', '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (uid, mail, split_part(mail, '@', 1))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  RETURN jsonb_build_object('is_admin', public.is_admin(uid));
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated;

-- 3. First account ever created becomes the studio owner. Nothing else grants access.
CREATE OR REPLACE FUNCTION public.grant_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users) THEN
    INSERT INTO public.admin_users (user_id, granted_by)
    VALUES (NEW.id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_first_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_grant_first_admin ON public.profiles;
CREATE TRIGGER profiles_grant_first_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_first_admin();