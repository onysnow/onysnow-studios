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
