-- Store the display font by the slug everything downstream matches on.
--
-- The portal wrote human-readable names ("Barlow Condensed") and the seed used
-- one too, but `CustomCss` lowercases the value and tests it against a
-- hyphenated set, and styles.css only defines `[data-display-font="..."]` rules
-- for the hyphenated form. So the stored value could never match anything: the
-- setting had never worked, including at its default.
UPDATE public.site_settings
SET value = lower(replace(trim(value), ' ', '-'))
WHERE key = 'display_font';

-- Anything that isn't one of the three faces actually requested from Google
-- Fonts in __root.tsx falls back to the studio default rather than silently
-- resolving to nothing.
UPDATE public.site_settings
SET value = 'jost'
WHERE key = 'display_font'
  AND value NOT IN ('jost', 'inter-tight', 'barlow-condensed');
