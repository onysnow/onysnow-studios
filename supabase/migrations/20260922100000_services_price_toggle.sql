-- Whether the services page shows a rate alongside each discipline.
--
-- Ony hasn't settled on how much pricing belongs on that page, so it's a switch
-- rather than a code change: the figures stay in `services.price_display` and
-- this only controls whether they're rendered. Defaults to showing, which is
-- what the page did before.
INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('services_show_prices', 'true', 'Show rates on the services page', 'bool', 45)
ON CONFLICT (key) DO NOTHING;
