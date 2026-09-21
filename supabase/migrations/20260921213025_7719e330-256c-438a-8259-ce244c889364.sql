-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ admin_users ============
CREATE TABLE public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id);
$$;

CREATE POLICY "Users see own admin row" ON public.admin_users FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage admins" ON public.admin_users FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- upsert own profile + claim first admin when nobody holds it yet
CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); mail TEXT; admins INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (uid, mail, split_part(coalesce(mail,''), '@', 1))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
  SELECT count(*) INTO admins FROM public.admin_users;
  IF admins = 0 THEN
    INSERT INTO public.admin_users (user_id, granted_by) VALUES (uid, uid) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('is_admin', public.is_admin(uid), 'claimed_first_admin', admins = 0);
END; $$;
REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated;

-- ============ categories ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_photo_id UUID,
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published categories" ON public.categories FOR SELECT TO anon, authenticated USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ photos ============
CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  width INT NOT NULL DEFAULT 1600,
  height INT NOT NULL DEFAULT 1067,
  blur_data_url TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published photos" ON public.photos FOR SELECT TO anon, authenticated USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage photos" ON public.photos FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
ALTER TABLE public.categories ADD CONSTRAINT categories_cover_photo_fkey FOREIGN KEY (cover_photo_id) REFERENCES public.photos(id) ON DELETE SET NULL;

-- ============ services ============
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  included TEXT[] NOT NULL DEFAULT '{}',
  turnaround TEXT NOT NULL DEFAULT '',
  price_display TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published services" ON public.services FOR SELECT TO anon, authenticated USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage services" ON public.services FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ testimonials ============
CREATE TABLE public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published testimonials" ON public.testimonials FOR SELECT TO anon, authenticated USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage testimonials" ON public.testimonials FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ page_content ============
CREATE TABLE public.page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'text' CHECK (format IN ('text','html','json')),
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_slug, section_key)
);
GRANT SELECT ON public.page_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_content TO authenticated;
GRANT ALL ON public.page_content TO service_role;
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published copy" ON public.page_content FOR SELECT TO anon, authenticated USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage copy" ON public.page_content FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ site_settings ============
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','longtext','url','email','css')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ inquiries ============
CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.inquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send an inquiry" ON public.inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read inquiries" ON public.inquiries FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins update inquiries" ON public.inquiries FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete inquiries" ON public.inquiries FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ updated_at triggers ============
CREATE TRIGGER t_profiles_u BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_admin_users_u BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_categories_u BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_photos_u BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_services_u BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_testimonials_u BEFORE UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_page_content_u BEFORE UPDATE ON public.page_content FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_site_settings_u BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inquiries_u BEFORE UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ storage policies (bucket: photos, private) ============
CREATE POLICY "Read photo files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'photos');
CREATE POLICY "Admins upload photo files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update photo files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'photos' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete photo files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'photos' AND public.is_admin(auth.uid()));

-- ============================= SEED =============================
INSERT INTO public.categories (slug, name, description, sort_order) VALUES
 ('candid','Candid','The glances, gestures, and bursts of laughter that happen when nobody is performing for the camera.',1),
 ('events','Events','The energy of your gathering, photographed from the inside—honestly, colorfully, and without interruption.',2),
 ('portraits','Portraits','Portraits with room to breathe: guided enough to feel comfortable, open enough to still feel like you.',3),
 ('fine-art','Fine Art','Ideas translated into color, gesture, atmosphere, and images made to live beyond the screen.',4),
 ('cosplay','Cosplay','Craft, character, and world-building treated with the same care as a cinematic production still.',5),
 ('street','Street','Unscripted city stories—light, weather, movement, and the split second where they become one frame.',6);

-- TEMPORARY PLACEHOLDER PHOTOGRAPHS: replace with Ony's own photographs from the admin portal.
INSERT INTO public.photos (storage_path, width, height, alt, title, category_id, sort_order, featured)
SELECT s.path, s.w, s.h, s.alt, CASE WHEN i = 1 THEN s.title ELSE s.title || ' — Study ' || i END,
       c.id, i, i = 1
FROM (VALUES
 ('seed/candid-city.webp',1536,1024,'Two friends laughing together on a rain-lit city street','Between the moments','candid'),
 ('seed/event-dance.webp',1536,1024,'A couple dancing together under warm lights at an evening celebration','The room came alive','events'),
 ('seed/portrait-window.webp',1024,1536,'A creative professional in natural window light with teal and amber tones','Quiet confidence','portraits'),
 ('seed/fine-art-red.webp',1024,1536,'A dancer moving flowing crimson fabric through teal and amber theatrical light','Crimson movement','fine-art'),
 ('seed/cosplay-neon.webp',1024,1536,'A futuristic cosplayer in a detailed original costume standing in a neon alley','After the rain','cosplay'),
 ('seed/street-night.webp',1536,1024,'A pedestrian with an umbrella passing a glowing corner shop on a rainy night','Corner light','street')
) AS s(path,w,h,alt,title,cat)
JOIN public.categories c ON c.slug = s.cat
CROSS JOIN generate_series(1,3) AS i;

UPDATE public.categories c SET cover_photo_id = p.id
FROM public.photos p WHERE p.category_id = c.id AND p.sort_order = 1;

INSERT INTO public.services (slug, name, summary, included, turnaround, price_display, sort_order)
SELECT c.slug, c.name, c.description, s.inc, '2–4 weeks', 'From $—', c.sort_order
FROM (VALUES
 ('candid', ARRAY['Natural, documentary coverage','Location guidance','Curated digital gallery']),
 ('events', ARRAY['Planning call','Candid + key moments','Private digital gallery']),
 ('portraits', ARRAY['Creative direction','One location','Fully retouched selects']),
 ('fine-art', ARRAY['Concept development','Lighting and set direction','Exhibition-ready files']),
 ('cosplay', ARRAY['Character moodboard','Dynamic location shoot','Detailed finishing']),
 ('street', ARRAY['Guided photo walk','Environmental portraits','Curated story edit'])
) AS s(slug, inc)
JOIN public.categories c ON c.slug = s.slug;

-- PLACEHOLDER TESTIMONIALS: replace with verified client quotes.
INSERT INTO public.testimonials (quote, author, context, sort_order) VALUES
 ('We forgot the camera was there—and somehow every feeling is in the photographs.','Placeholder client 01','Wedding celebration',1),
 ('The color, the energy, the in-between moments. It feels exactly like our night felt.','Placeholder client 02','Anniversary party',2),
 ('Ony made the whole process easy, then delivered images that stopped us in our tracks.','Placeholder client 03','Portrait session',3);

INSERT INTO public.page_content (page_slug, section_key, value, format, sort_order) VALUES
 ('home','hero_eyebrow','Professional candid photography','text',1),
 ('home','hero_title','Life, exactly as it felt.','text',2),
 ('home','intro_eyebrow','What I do','text',3),
 ('home','intro_title','I photograph the part you didn’t know you’d want to remember.','text',4),
 ('home','intro_body','I’m Ony. I look for the unscripted frame—the laugh after the pose, the breath before the entrance, the light that changes a familiar street. The result is honest photography with cinematic color and atmosphere.','text',5),
 ('home','services_eyebrow','Ways to work together','text',6),
 ('home','featured_eyebrow','Selected work','text',7),
 ('home','featured_title','Stories in color.','text',8),
 ('home','philosophy_title','Nothing forced.<br/><em>Everything felt.</em>','html',9),
 ('home','philosophy_body','Candid photography isn’t about standing back and hoping. It’s about reading a room, earning trust, and being ready when the real moment arrives. I guide when it helps, disappear when it matters, and keep the atmosphere intact.','text',10),
 ('home','testimonials_eyebrow','Kind words','text',11),
 ('home','instagram_caption','Follow the work · Instagram','text',12),
 ('home','cta_eyebrow','Your story, honestly told','text',13),
 ('home','cta_title','Let’s make something that feels like you.','text',14),
 ('about','intro_eyebrow','About Ony','text',1),
 ('about','intro_title','I photograph people as they are—not as they’re told to be.','text',2),
 ('about','intro_body','For me, the best photograph begins before the shutter: with trust, attention, and enough room for something real to happen.','text',3),
 ('about','story_eyebrow','My story','text',4),
 ('about','story_title','The camera taught me to notice.','text',5),
 ('about','story_body','<p>I started by photographing the small things: a look across a room, color reflected in wet pavement, the instant somebody forgot they were being watched. Those frames felt alive. I’ve been chasing that feeling ever since.</p><p>Today, I bring that attention to celebrations, portraits, imagined worlds, and everyday streets. I care about craft—light, composition, color—but technique should serve the feeling, never interrupt it.</p>','html',6),
 ('about','process_eyebrow','The process','text',7),
 ('about','process_title','Listen. Observe. Make space. Deliver with care.','text',8),
 ('about','process_body','We begin with what matters to you. On the day, I offer clear direction when you need it and step back when the moment needs room. Every final frame is selected and graded by hand.','text',9),
 ('portfolio','intro_eyebrow','Portfolio','text',1),
 ('portfolio','intro_title','Unscripted stories. Cinematic frames.','text',2),
 ('portfolio','intro_body','Six ways of looking, connected by honest moments, saturated color, and a respect for atmosphere.','text',3),
 ('services','intro_eyebrow','Services & pricing','text',1),
 ('services','intro_title','Choose the shape. Keep the feeling.','text',2),
 ('services','intro_body','Every commission is built around the story, not a rigid shot list. These starting points make it easy to begin.','text',3),
 ('contact','intro_eyebrow','Contact','text',1),
 ('contact','intro_title','Tell me what you’re imagining.','text',2),
 ('contact','intro_body','A date, a feeling, a half-formed idea—send what you have. We can build the rest together.','text',3),
 ('book','intro_eyebrow','Booking','text',1),
 ('book','intro_title','Let’s find your date.','text',2),
 ('book','intro_body','Scheduling and payment arrive in the next phase. In the meantime, send an inquiry and I’ll reply personally.','text',3),
 ('privacy','intro_title','Privacy','text',1),
 ('privacy','intro_body','A plain-language overview of how information is handled on this site.','text',2),
 ('privacy','body','<p>Inquiries sent through the contact form are stored securely and used only to respond to you.</p><h2>How information is used</h2><p>Information you provide will be used only to respond to your inquiry, prepare photography services, and meet legal obligations.</p><h2>Questions</h2><p>Contact the studio with any privacy question.</p>','html',3),
 ('terms','intro_title','Terms','text',1),
 ('terms','intro_body','The basic terms for using this website.','text',2),
 ('terms','body','<p>The imagery and copy currently shown are temporary presentation materials. Final photography, pricing, booking terms, usage licenses, cancellation policies, and delivery commitments will be confirmed before the studio accepts bookings through this site.</p><h2>Copyright</h2><p>Unless otherwise stated, final photographs and site content belong to OnySnow Studios and may not be reproduced without permission.</p><h2>Bookings</h2><p>A booking is not confirmed until both parties agree to the final service terms and any required payment is received.</p>','html',3);

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
 ('studio_name','OnySnow Studios','Studio name','text',1),
 ('tagline','Professional candid photography, made with feeling.','Tagline','text',2),
 ('contact_email','hello@onysnow.example','Contact email','email',3),
 ('phone','','Phone','text',4),
 ('service_area','Available locally and for travel','Service area','text',5),
 ('instagram_url','https://instagram.com','Instagram URL','url',6),
 ('booking_url','','External booking URL','url',7),
 ('seo_title','OnySnow Studios — Professional Candid Photography','Default SEO title','text',8),
 ('seo_description','Cinematic candid, event, portrait, fine art, cosplay, and street photography by Ony Shannon.','Default SEO description','longtext',9),
 ('custom_css','','Custom CSS (applied site-wide)','css',10);