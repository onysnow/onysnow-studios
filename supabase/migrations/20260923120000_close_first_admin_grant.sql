-- Close the automatic first-admin grant.
--
-- `grant_first_admin()` fired on every insert into `profiles` and granted admin
-- to whoever caused it, whenever `admin_users` happened to be empty. Combined
-- with open self-service signup on /auth, that made "the next stranger to sign
-- up" a path to full studio access: every inquiry, the subscriber list, every
-- public page, and storage write and delete.
--
-- It was not a theoretical window either. `admin_users.user_id` is
-- `REFERENCES auth.users ON DELETE CASCADE`, so deleting the owner's auth row
-- empties the table, and so does a fresh database, a restored backup, or a
-- staging clone pointed at the same front end.
--
-- Migration `20260921214942` had already dropped the "Admins manage admins"
-- policy, leaving `admin_users` with only a SELECT policy. That is the right
-- shape: with this trigger gone there is NO path to admin through the
-- application at all, by design. Granting a new admin is a deliberate act
-- performed from the Supabase dashboard, which is appropriate for a studio
-- with one operator.
--
-- The check below is a guard rail, not ceremony. Applying this to a database
-- whose `admin_users` is already empty would lock everyone out permanently,
-- so it fails loudly instead.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users) THEN
    RAISE EXCEPTION
      'admin_users is empty: dropping the first-admin trigger now would leave no way in. Insert the owner''s row from the Supabase dashboard first, then re-run this migration.';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS profiles_grant_first_admin ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_first_admin();
