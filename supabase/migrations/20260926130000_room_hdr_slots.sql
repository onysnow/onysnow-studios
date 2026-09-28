-- Upload slots for the rooms the glass reflects, in real brightness.
--
-- The glass shader now reflects the room from an HDR image (log-encoded JPEG,
-- 2048 x 512, made with art-source/rooms/build_hdr_rooms.py) so the room's
-- lamps keep their brightness at glass's ~4% reflectance. One row per room,
-- same order as the existing room_*_url rows. Empty means the shipped file in
-- public/rooms-hdr/. An ordinary photo uploaded here would read far too
-- bright: the encoding is not sRGB.
--
-- Idempotent: safe to run twice, and it will not overwrite a URL already set.

INSERT INTO public.site_settings (key, value, label, kind, sort_order) VALUES
  ('room_metro_hdr_url',     '', 'Room reflection (HDR) — Metro',     'image', 47),
  ('room_aquarium_hdr_url',  '', 'Room reflection (HDR) — Aquarium',  'image', 48),
  ('room_studio_hdr_url',    '', 'Room reflection (HDR) — Studio',    'image', 49),
  ('room_lobby_hdr_url',     '', 'Room reflection (HDR) — Lobby',     'image', 50),
  ('room_fireplace_hdr_url', '', 'Room reflection (HDR) — Fireplace', 'image', 51),
  ('room_station_hdr_url',   '', 'Room reflection (HDR) — Station',   'image', 52)
ON CONFLICT (key) DO NOTHING;
