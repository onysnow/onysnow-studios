ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_kind_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_kind_check
  CHECK (kind IN ('text','longtext','email','url','css','font','scale','number'));

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('display_font', 'Barlow Condensed', 'Headline font', 'font', 11),
  ('display_scale', '1', 'Headline size', 'scale', 12)
ON CONFLICT (key) DO NOTHING;