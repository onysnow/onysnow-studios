# OnySnow Studios — roadmap

## Phase 1 — public marketing site (done)
- [x] Cinematic design system, routes, galleries, lightbox, contact form

## Phase 2 — database-backed content + admin portal
- [x] Fix hero image rendering (replaced build-time pipeline with stored URLs)
- [x] Remove vite-imagetools and build-time image pipeline
- [x] Database schema + RLS + seed of all current content
- [x] Storage-backed `<Img />` with stored blur placeholders
- [x] Public pages read from the database via TanStack Query
- [x] Contact form persists inquiries
- [ ] Admin portal: dashboard, photos, categories, services, testimonials, page copy, inquiries, settings, advanced (JSON + custom CSS)
- [ ] Auth: sign in, explicit admin grant, first-admin bootstrap
- [ ] Verify preview desktop + mobile

## Phase 3 — design correction + portfolio rebuild
- [ ] Replace serif display face with Barlow Condensed (film-titling feel, tight tracking)
- [ ] Re-derive whole type scale ~half current hero size, responsive
- [ ] Restrained CTA button sizing sitewide
- [ ] Layout audit: equal-height cards, bottom-pinned actions, shared spacing scale,
      uniform section padding, one max-width container, optical left-edge alignment
- [ ] Portfolio landing: one mixed justified-rows gallery via react-photo-album
- [ ] Subtle letter-spaced filter bar, filters in place, `?category=` URL param,
      `/portfolio/[category]` deep links land on filtered view
- [ ] Parallax + sequenced reveals with framer-motion useScroll/useTransform,
      transform-only, reduced-motion respected, damped on mobile
- [ ] Settings: display-font choice + display-scale control
- [ ] Verify every page at desktop and mobile, re-check alignment
