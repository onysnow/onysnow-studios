-- The glass's smudge and scratch layers, each swappable from the portal.
--
-- The glass shader used to read one packed map (glass_surface_url) with the
-- specks, smears and wear in its colour channels. It now reads two separate
-- greyscale photographs, one per surface layer, hex-tiled so they never
-- visibly repeat. One upload per layer, so replacing the scratches does not
-- mean rebuilding the smudges.
--
-- Empty means the file shipped in public/ (glass-smudge.jpg,
-- glass-scratch.jpg), which is also what "Reset to default" leaves behind.
-- glass_surface_url stays: the cursor light and the transmitted pool still
-- read it.
--
-- Idempotent: safe to run twice, and it will not overwrite a URL already set.

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('glass_smudge_url',  '', 'Glass smudge layer (seamless, greyscale)',  'image', 38),
  ('glass_scratch_url', '', 'Glass scratch layer (seamless, greyscale)', 'image', 39)
ON CONFLICT (key) DO NOTHING;
