-- ============================================================================
-- Rate limits for the two write paths the public can reach.
--
-- `inquiries` and `subscribers` both accept inserts from `anon`. Length checks
-- already bound the size of a single row, but nothing bounded how many rows one
-- source could write. Both are trivially scriptable, and the only cost of abuse
-- today is Ony's inbox and the subscriber list.
--
-- The limit lives in the database rather than in the form, because the form is
-- not the only way to reach the table: PostgREST is a public HTTP endpoint and
-- the anon key ships in the client bundle. Anything enforced in React is
-- advisory.
--
-- Limits are table-driven on purpose. ADR-0002 says to tune these against real
-- traffic rather than against a guess, and a guess is exactly what the numbers
-- below are — so changing them is an UPDATE, not a migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Where the counters live.
--
-- No RLS policies at all: `anon` and `authenticated` are never granted anything
-- here, so the table is unreachable over PostgREST. Only the SECURITY DEFINER
-- trigger below touches it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.write_throttle (
  bucket       TEXT        NOT NULL,
  -- A salted hash of the caller's IP, or of their email when no IP is visible.
  -- Never the address itself: this is an abuse counter, not a visitor log.
  actor        TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, actor, window_start)
);
ALTER TABLE public.write_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.write_throttle FROM anon, authenticated;
GRANT ALL ON public.write_throttle TO service_role;

-- Sweeping expired windows is the only scan this table ever needs.
CREATE INDEX IF NOT EXISTS write_throttle_window_idx
  ON public.write_throttle (window_start);

-- ---------------------------------------------------------------------------
-- The limits themselves.
--
-- Readable by nobody but admins — knowing the exact ceiling is knowing exactly
-- how hard to push without tripping it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_rules (
  bucket      TEXT PRIMARY KEY,
  window_secs INTEGER NOT NULL CHECK (window_secs BETWEEN 10 AND 86400),
  max_hits    INTEGER NOT NULL CHECK (max_hits BETWEEN 1 AND 10000),
  -- Shown to the visitor when they trip it, so the copy can be adjusted without
  -- touching the client.
  message     TEXT    NOT NULL DEFAULT 'Too many attempts. Please try again later.'
);
ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_rules FROM anon;
GRANT SELECT ON public.rate_limit_rules TO authenticated;
GRANT ALL ON public.rate_limit_rules TO service_role;
DROP POLICY IF EXISTS "Admins manage rate limits" ON public.rate_limit_rules;
CREATE POLICY "Admins manage rate limits" ON public.rate_limit_rules
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Opening numbers. A real person sends one enquiry and subscribes once; these
-- are set where a human never notices them and a script does immediately.
INSERT INTO public.rate_limit_rules (bucket, window_secs, max_hits, message) VALUES
  ('inquiries',   3600, 5,  'You''ve sent a few messages already — give it an hour, or email the studio directly.'),
  ('subscribers', 3600, 3,  'That''s a few sign-ups from here already. Try again in a little while.')
ON CONFLICT (bucket) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Identifying the caller.
--
-- PostgREST exposes the request headers to SQL. Behind Cloudflare the honest
-- value is `cf-connecting-ip`; `x-forwarded-for` is a list whose first entry is
-- the client and whose later entries are proxies. If neither is present — a
-- direct psql session, a server-side call — we fall back to the email on the
-- row, which still stops the same address being used in a loop.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_actor(fallback TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  headers JSONB;
  ip      TEXT;
BEGIN
  BEGIN
    headers := current_setting('request.headers', true)::JSONB;
  EXCEPTION WHEN OTHERS THEN
    headers := NULL;
  END;

  IF headers IS NOT NULL THEN
    ip := COALESCE(
      NULLIF(headers ->> 'cf-connecting-ip', ''),
      NULLIF(split_part(COALESCE(headers ->> 'x-forwarded-for', ''), ',', 1), ''),
      NULLIF(headers ->> 'x-real-ip', '')
    );
  END IF;

  ip := COALESCE(btrim(ip), '');
  IF ip = '' THEN
    ip := 'email:' || lower(COALESCE(btrim(fallback), 'unknown'));
  ELSE
    ip := 'ip:' || ip;
  END IF;

  -- Hashed with a per-database salt so the stored value can't be walked back to
  -- an address even with the table in hand.
  RETURN encode(
    sha256((ip || ':' || COALESCE(current_setting('app.throttle_salt', true), 'onysnow'))::BYTEA),
    'hex'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- The trigger.
--
-- BEFORE INSERT so a rejected write never reaches the table, and SECURITY
-- DEFINER so `anon` can bump a counter it cannot read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_write_throttle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  bucket_name TEXT := TG_ARGV[0];
  rule        public.rate_limit_rules%ROWTYPE;
  actor_key   TEXT;
  win         TIMESTAMPTZ;
  current_hits INTEGER;
BEGIN
  SELECT * INTO rule FROM public.rate_limit_rules WHERE bucket = bucket_name;
  -- No rule configured means no limit. Deleting a row in `rate_limit_rules` is
  -- the intended way to switch one off.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- An admin working in the portal is not who this is for.
  IF auth.uid() IS NOT NULL AND public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  actor_key := public.request_actor(NEW.email);

  -- Fixed windows rather than a sliding log: one row per actor per window
  -- instead of one row per attempt, which is the difference between a counter
  -- and a second copy of the thing we're trying to limit.
  win := to_timestamp(
    floor(extract(EPOCH FROM now()) / rule.window_secs) * rule.window_secs
  );

  INSERT INTO public.write_throttle (bucket, actor, window_start, hits)
  VALUES (bucket_name, actor_key, win, 1)
  ON CONFLICT (bucket, actor, window_start)
  DO UPDATE SET hits = public.write_throttle.hits + 1
  RETURNING hits INTO current_hits;

  IF current_hits > rule.max_hits THEN
    -- P0001 surfaces as a 400 through PostgREST with this message intact, so
    -- the form can show it verbatim.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = rule.message;
  END IF;

  -- Opportunistic sweep. Doing this on ~1% of writes keeps the table from
  -- growing without putting a DELETE in the hot path of every insert.
  IF random() < 0.01 THEN
    DELETE FROM public.write_throttle WHERE window_start < now() - INTERVAL '1 day';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_inquiries_throttle ON public.inquiries;
CREATE TRIGGER t_inquiries_throttle
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_throttle('inquiries');

DROP TRIGGER IF EXISTS t_subscribers_throttle ON public.subscribers;
CREATE TRIGGER t_subscribers_throttle
  BEFORE INSERT ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_throttle('subscribers');
