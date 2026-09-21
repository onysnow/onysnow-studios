# OnySnow Vision

Build the marketing site for **OnySnow Studios**, a professional photography studio. This is phase one — the public-facing site. Booking and payments come in a follow-up message, so leave clean seams for them.

## Who this is for
Ony Shannon, a photographer whose signature is **professional candid photography** — real, unposed moments — which extends into event photography, portraits, fine art shoots, cosplay photography, and street photography. His work is **cinematic and full of color**: rich grading, filmic contrast, strong atmosphere. The site must feel like his photographs do.

## Reference
The structure and pacing should echo jovanarikalo.com — a fine-art photographer's site: dark, elegantly minimal navigation over full-bleed imagery; hero-driven sections that alternate between large photography and generous whitespace; portfolio split into named categories; the artist's own voice in the copy. Do not copy its text, colors, or layouts literally — this is a different photographer with a different feel. Take the *architecture and restraint*, not the design.

## Important build constraint
**Use prebuilt, well-known libraries and shadcn/ui components wherever one exists. Do not hand-roll anything that a standard package already solves.** No custom carousel, no custom lightbox, no custom accordion, no custom form validation. Reach for embla-carousel (already behind shadcn's carousel), yet-another-react-lightbox or photoswipe for the gallery lightbox, react-hook-form + zod for forms, framer-motion for motion, react-router-dom for routing, lucide-react for icons. Keep custom code to layout, composition and styling.

## Pages
- **Home** — full-bleed cinematic hero with the studio name and a single primary CTA ("Book a session"); a short "what I do" intro in Ony's voice; a services grid of the six disciplines; a featured-work section previewing the portfolio categories; a section explaining the candid-photography philosophy; social proof / testimonials (placeholder quotes, clearly marked as placeholder in a comment); an Instagram strip; and a closing booking CTA.
- **Portfolio** — landing page with the six categories as large image tiles: Candid, Events, Portraits, Fine Art, Cosplay, Street. Each category gets its own route with a masonry gallery and a lightbox.
- **About** — Ony's story, approach, and process. Write it warm and first-person but leave obvious `{/* PLACEHOLDER COPY */}` markers so he can rewrite it.
- **Services & Pricing** — the six disciplines as detailed cards with what's included, turnaround, and a price placeholder, each with a "Book this" button. Buttons should route to /book for now.
- **Book** — a page shell with heading and intro copy; leave a clearly-marked `<BookingEmbed />` placeholder component. I'll fill it next message.
- **Contact** — form (react-hook-form + zod, submitting to a stub handler for now), plus email, service area, and social links.
- Plus simple Privacy and Terms pages.

## Design direction
Clean and modern but not safe — push the UI/UX a little. Specifically:
- **Palette:** near-black base (not pure #000 — something like a warm charcoal), off-white type, and a cinematic teal-and-amber accent pairing that echoes film grading. Define it all as HSL CSS variables in index.css and Tailwind theme tokens. No hardcoded colors in components.
- **Type:** a high-contrast display serif for headings (Instrument Serif or Cormorant Garamond via Google Fonts) against a clean geometric sans for body (Inter or similar). Big, confident headline sizes with tight tracking.
- **Motion:** framer-motion scroll-reveal on sections, subtle parallax on hero imagery, image scale-on-hover in galleries. Restrained — it should feel expensive, not busy.
- **Texture:** a very subtle film-grain overlay across the site, and soft vignetting on hero images. This is a photographer's site; it should feel photographic.
- Fully responsive, mobile-first. The mobile nav should be a full-screen overlay, not a cramped dropdown.

## Images — important
All photography will be Ony's own, added later. For now use tasteful placeholder imagery, but build the image layer so swapping is painless:
1. Install and configure **`vite-imagetools`**. Photos live in `src/assets/` and are imported, so Vite generates responsive AVIF and WebP derivatives at multiple widths at build time — free, no CDN account, no external service.
2. Create a single reusable **`<Img />` component** that every image on the site goes through. It should handle `srcset`/`sizes`, `loading="lazy"`, `decoding="async"`, aspect-ratio boxes to prevent layout shift, and a blurred low-quality placeholder that fades to the real image.
3. Keep every image reference in a **single `src/data/portfolio.ts` manifest** (category, title, alt text, orientation, image import) so Ony can add or swap photos by editing one file rather than hunting through components.
4. Add a short `IMAGES.md` at the project root explaining, in plain language, how he adds his own photos: what to export from Lightroom (long edge ~2560px for gallery, ~3840px for full-bleed heroes, sRGB, quality 80), where to drop them, and how to register them in the manifest.

Accessibility matters: real alt text, visible focus states, and keyboard-navigable gallery and lightbox.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/06c54883-b18a-4099-be56-2a0823b4c2e8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
