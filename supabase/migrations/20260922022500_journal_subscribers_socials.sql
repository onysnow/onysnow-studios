-- Journal (magazine-layout blog), subscribers, and extra site settings.

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  cover_photo_id UUID REFERENCES public.photos(id) ON DELETE SET NULL,
  -- Ordered, typed blocks rather than one HTML blob: that is what allows a post
  -- to be laid out as a spread instead of a column of text.
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  reading_minutes INT NOT NULL DEFAULT 3,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published posts are public" ON public.posts FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "Admins manage posts" ON public.posts FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER t_posts_u BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (char_length(email) BETWEEN 5 AND 254 AND email LIKE '%_@_%._%'),
  source TEXT NOT NULL DEFAULT '' CHECK (char_length(source) <= 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
-- Insert-only for the public; the list is never readable without admin rights.
CREATE POLICY "Anyone can subscribe" ON public.subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read subscribers" ON public.subscribers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete subscribers" ON public.subscribers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Bound the public inquiry write so it can't be used as a dumping ground.
ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_len;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_len CHECK (
  char_length(name) BETWEEN 1 AND 120
  AND char_length(email) BETWEEN 5 AND 254
  AND char_length(message) BETWEEN 1 AND 4000
  AND char_length(kind) <= 40
);

ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_kind_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_kind_check CHECK (
  kind = ANY (ARRAY['text','longtext','email','url','css','font','scale','number','bool'])
);

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('tiktok_url','', 'TikTok URL','url', 20),
  ('facebook_url','', 'Facebook Page URL','url', 21),
  ('youtube_url','', 'YouTube URL','url', 22),
  ('x_url','', 'X / Twitter URL','url', 23),
  ('behance_url','', 'Behance URL','url', 24),
  ('cal_link','', 'Cal.com link (e.g. onysnow/session)','text', 30),
  ('duo_enabled','false','Show the father & daughter service','bool', 40)
ON CONFLICT (key) DO NOTHING;
