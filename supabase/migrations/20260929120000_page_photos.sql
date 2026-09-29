-- Page photos: which photograph goes in each spot on a page, and what to keep
-- in frame there.
--
-- Replaces the star (`photos.featured`, which set only the home hero) and
-- "position in the photo list" (which set the home page's bands and frames,
-- so dragging a photo in the library silently swapped them).
--
-- The spots themselves are declared in code (src/lib/page-photos.ts): only the
-- code knows which elements a page has. This table stores only the choices,
-- one row per spot that has been set. A spot with no row, or whose photograph
-- has been deleted (ON DELETE SET NULL), falls back to what the site did
-- before, so an empty table changes nothing.
--
-- focus_x / focus_y: the point to keep in frame, 0..1 from the top-left,
-- applied as the picture's object-position. NULL = never set, and the site's
-- own framing stands.
--
-- Idempotent: safe to run twice, and it will not overwrite a choice.

CREATE TABLE IF NOT EXISTS public.page_photos (
  key        text PRIMARY KEY,
  photo_id   uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  focus_x    real CHECK (focus_x BETWEEN 0 AND 1),
  focus_y    real CHECK (focus_y BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.page_photos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.page_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_photos TO authenticated;
GRANT ALL ON public.page_photos TO service_role;

DROP POLICY IF EXISTS "Anyone reads page photos" ON public.page_photos;
CREATE POLICY "Anyone reads page photos" ON public.page_photos
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage page photos" ON public.page_photos;
CREATE POLICY "Admins manage page photos" ON public.page_photos
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Carry today's starred photograph over as the home hero, so nothing on the
-- page changes when this runs.
INSERT INTO public.page_photos (key, photo_id)
SELECT 'home.hero', id FROM public.photos
WHERE featured AND published
ORDER BY sort_order
LIMIT 1
ON CONFLICT (key) DO NOTHING;

-- PostgREST caches the schema; without this the new table 404s until it
-- happens to reload.
NOTIFY pgrst, 'reload schema';
