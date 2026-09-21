# OnySnow Studios — Phase One Marketing Site

## Direction
Build a dark, cinematic photography site with warm charcoal surfaces, off-white type, teal and amber film-grade accents, display-serif headlines, subtle grain, and restrained motion. The experience will prioritize imagery, generous spacing, and Ony's candid-first voice without copying the reference site.

## Site structure
- Add a shared transparent-to-solid header, full-screen mobile navigation, footer, focus states, and skip link.
- Build `/` with a full-bleed hero, first-person introduction, six service disciplines, featured portfolio categories, candid philosophy, placeholder testimonials, Instagram-style strip, and closing booking invitation.
- Build `/portfolio` plus `/portfolio/candid`, `/portfolio/events`, `/portfolio/portraits`, `/portfolio/fine-art`, `/portfolio/cosplay`, and `/portfolio/street`.
- Build `/about`, `/services`, `/book`, `/contact`, `/privacy`, and `/terms`.
- Give every page unique title, description, Open Graph, and Twitter metadata.

## Photography system
- Generate a cohesive set of tasteful temporary photographs with colorful cinematic grading; these remain clearly replaceable assets, not implied examples of Ony's work.
- Install and configure `vite-imagetools` for AVIF/WebP responsive derivatives at multiple widths.
- Keep every photograph and its category, title, alt text, orientation, dimensions, and responsive source data in `src/data/portfolio.ts`.
- Create one reusable `<Img />` that handles aspect-ratio reservation, responsive sources, lazy loading by default, async decoding, low-quality blur, and load fade-in. Above-the-fold images may opt into eager/high-priority loading through the same component.
- Add `IMAGES.md` with Lightroom export settings, file placement, and manifest-editing instructions.

## Shared experience
- Use Framer Motion for reduced-motion-aware section reveals and subtle hero parallax.
- Use `yet-another-react-lightbox` for keyboard-accessible gallery viewing; galleries use responsive masonry columns and restrained image zoom on hover.
- Use existing shadcn components for buttons, mobile navigation, form fields, and feedback states; use Lucide icons for interface actions.
- Keep a dedicated `<BookingEmbed />` placeholder inside `/book` so scheduling and payments can be added without restructuring the page.

## Content and interaction
- Write warm first-person draft copy for Ony; About copy will include visible code comments marking it as placeholder text.
- Services show inclusions, turnaround, placeholder pricing, and working “Book this” links to `/book`.
- Contact uses React Hook Form + Zod and a non-persistent stub submission with clear success feedback.
- Testimonials remain visibly marked as placeholder content in source comments.
- Social and contact details will be honest placeholders where the brief did not provide real values.

## Technical details
- Use the project’s required TanStack Router rather than adding React Router DOM; all requested navigation behavior remains the same.
- Extend the Tailwind v4 design system in `src/styles.css` with semantic OKLCH tokens matching the requested near-black, off-white, teal, and amber palette. The requested HSL intent is preserved through semantic tokens while following this project’s required color format.
- Install only the missing standard packages: `framer-motion`, `yet-another-react-lightbox`, and `vite-imagetools`.
- Verify key routes, keyboard interactions, image loading, lightbox behavior, and desktop/mobile layouts in the live preview.
