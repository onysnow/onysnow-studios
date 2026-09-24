-- Make the effect layer's image files changeable from the portal.
--
-- The glass smudge/scratch map was a string literal in two components
-- (`/glass-surface.jpg`), so changing the look of the glass meant editing
-- source and redeploying. This adds the settings row that points at it.
--
-- `kind = 'image'` is a new kind the settings page renders as an upload
-- control with a preview, rather than a text field. An EMPTY value is not a
-- broken site: every consumer falls back to the file shipped in `public/`,
-- which is also what the portal's "Reset to default" leaves behind.
--
-- Idempotent: safe to run twice, and it will not overwrite a URL already set.

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
