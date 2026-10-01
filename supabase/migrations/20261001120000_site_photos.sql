-- Site photographs kept out of the portfolio (item 38c; Ony, 2026-10-01:
-- "separate the portfolio photo uploaded/editor and the content photo stuff").
--
-- A photograph uploaded for a place on a page (the hero, a full-bleed frame)
-- is a site photograph: it shows where it is placed, never in the portfolio's
-- gallery. Every photograph already uploaded stays in the portfolio.
--
-- Safe to run twice.
alter table public.photos
  add column if not exists in_portfolio boolean not null default true;

comment on column public.photos.in_portfolio is
  'false: a site photograph, uploaded for a place on a page; kept out of the portfolio gallery.';
