-- Make the effect layer's image files changeable from the portal.
--
-- The glass smudge/scratch map and the six room reflections were string
-- literals in source (`/glass-surface.jpg`, `/rooms/<name>.jpg`), so changing
-- the look of the glass meant editing code and redeploying. These rows point
-- at them instead.
--
-- `kind = 'image'` is a new kind the settings page renders as an upload
-- control with a preview. The kind column carries a CHECK constraint, so it
-- has to be widened BEFORE any row using the new kind is inserted -- the
-- first version of this migration did not, and every insert was rejected with
-- `site_settings_kind_check`. Same drop-and-recreate the migrations that
-- added 'font' and 'bool' used.
--
-- An EMPTY value is not a broken site: every consumer falls back to the file
-- shipped in `public/`, which is also what the portal's "Reset to default"
-- leaves behind.
--
-- Idempotent: safe to run twice, and it will not overwrite a URL already set.

ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_kind_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_kind_check CHECK (
  kind = ANY (ARRAY['text','longtext','email','url','css','font','scale','number','bool','image'])
);

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('glass_surface_url', '', 'Glass smudge & scratch texture', 'image', 40)
ON CONFLICT (key) DO NOTHING;

-- The six room reflections, one row per slot.
--
-- Per slot rather than one row holding a list, because the upload control is
-- per file and replacing a single room should not mean re-uploading the other
-- five. Empty means the graded HDRI that ships with the site.
--
-- The order matches ROOMS in src/lib/rooms.ts, which is what the pre-paint
-- script cycles through on each load.
INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('room_metro_url',     '', 'Room reflection — Metro',     'image', 41),
  ('room_aquarium_url',  '', 'Room reflection — Aquarium',  'image', 42),
  ('room_studio_url',    '', 'Room reflection — Studio',    'image', 43),
  ('room_lobby_url',     '', 'Room reflection — Lobby',     'image', 44),
  ('room_fireplace_url', '', 'Room reflection — Fireplace', 'image', 45),
  ('room_station_url',   '', 'Room reflection — Station',   'image', 46)
ON CONFLICT (key) DO NOTHING;
