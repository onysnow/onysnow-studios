# ADR-0001: OnySnow Studios site architecture

**Status:** Proposed
**Date:** 2026-09-21
**Deciders:** Ony Shannon (owner/operator)

## Context

The site was generated quickly and works, but it was assembled feature-by-feature rather than designed. It now has to carry real weight: a growing photograph archive, a magazine-style blog, a bookable service catalogue with payments, and an inquiry-only service involving a minor. It is operated by one person who is not full-time on it.

**What exists today**

| Layer | Current choice |
|---|---|
| Framework | TanStack Start 1.168 (SSR, Vite 8, Nitro → Cloudflare Worker) |
| UI | React 19, Tailwind v4, shadcn/ui (46 components), Radix primitives |
| Data | Supabase (Postgres + Auth + Storage), RLS enforced, `@supabase/supabase-js` |
| Fetching | TanStack Query, entirely client-side |
| Media | Browser-side resize to one 2560px WebP → private bucket → signing proxy route |
| Admin | `/admin` behind Supabase Auth, TipTap, CodeMirror, dnd-kit, react-dropzone |
| Tests / CI | None |

**Constraints that shape every decision below**

1. Solo operator. Maintenance burden is the scarcest resource, not compute.
2. Budget is free-tier-first. Supabase free (1 GB storage, 5 GB egress/month).
3. Discovery is organic search and social link previews — SEO is a revenue path, not a nicety.
4. It is a photography site. Image delivery *is* the product experience.
5. The archive grows monotonically. A working photographer adds hundreds of frames a year.

## Decision

Keep the stack. Fix how it is used. Specifically: **ship real responsive images, render content on the server, and prune the component surface** — in that order. No framework migration, no component-library change, no CMS replacement.

The stack choices are sound. The implementation has three defects that will get worse with scale and two that are cheap to fix now.

---

## Findings, by severity

### P0 — Images are served at full size, always

`Img.tsx` accepts a `sizes` prop and forwards it to `<img>`, but never emits a `srcset`. With no `srcset`, `sizes` is inert — the browser has exactly one candidate and downloads it. Every photograph on the site is the full 2560px WebP, including the ones rendered into a 280px-tall gallery row and the six thumbnails in the Instagram strip.

On the portfolio page that is roughly 40 full-resolution images per view. At ~400 KB each that is ~16 MB for one page, against a 5 GB/month egress allowance: **about 300 portfolio views per month before the free tier is exhausted.** It is also the reason mobile will feel slow no matter how restrained the motion is.

This is the same problem we solved with `vite-imagetools` and then removed when content moved into the database. It was never re-solved.

### P0 — Every image request triggers a signing API call

`/api/public/photo/$` mints a *fresh* signed URL per request: the worker POSTs to Supabase's sign endpoint, then 302-redirects. Three network hops per photograph, one of them a write-ish API call, cached for only 600 seconds.

The migration already grants `anon` SELECT on `storage.objects` for the `photos` bucket:

```sql
CREATE POLICY "Read photo files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'photos');
```

So the signing indirection buys **no security whatsoever** — the objects are already publicly readable. It is pure latency and pure API quota. Forty images on a page means forty signing calls per visitor.

### P0 — Content is client-fetched, so pages ship empty

Every route calls `useQuery` inside its component. The server sends skeletons; text and images appear only after JS boots and two round-trips resolve. Consequences:

- Search engines index a page with no headline, no copy, no images.
- Social link previews have no `og:image`, because the hero photograph isn't known at render time.
- LCP is gated behind JS + query + signing redirect + full-size download — four serial steps.

TanStack Start supports route loaders. This is a fix of ergonomics, not architecture.

### P1 — `photosQuery` fetches the entire archive on every page

```ts
queryFn: () => rows<Photo>("photos", (q) => q.eq("published", true).order("sort_order"))
```

`select("*")`, no limit, no category filter, on every route including the homepage — then filtered in JavaScript. Each row carries a base64 `blur_data_url`. At today's seed of a few photos this is invisible. At 1,000 photographs it is several megabytes of JSON on every page load, and it never gets better on its own.

### P1 — The component surface is four times larger than what's used

46 shadcn components, ~4,363 lines, against ~380 lines of actual site components. Unused and heavy: `chart.tsx` (pulls **recharts**, the largest single dependency in the tree), `carousel` (embla), `menubar`, `context-menu`, `resizable`, `input-otp`, `drawer` (vaul), `command` (cmdk), `pagination`, `breadcrumb`, `hover-card`, `navigation-menu`.

Tree-shaking keeps most of this out of the client bundle, so the cost is not primarily bytes — it is **maintenance and comprehension surface**: 4,000 lines that lint, typecheck, and must be reasoned about when upgrading Radix or Tailwind, for zero delivered value.

### P1 — The typed Supabase client is discarded

`src/integrations/supabase/types.ts` contains generated database types. `content.ts` then does:

```ts
async function rows<T>(table: string, build: (q: any) => any): Promise<T[]> {
  const { data, error } = await build((supabase as any).from(table).select("*"));
```

Two `any` casts erase them. The hand-written types in `content.ts` can drift from the schema silently — exactly the class of bug that costs an evening.

### P2 — Smaller items

- **Dead code:** `Gallery.tsx` (column masonry) is superseded by `JustifiedGallery.tsx` and no longer reachable.
- **`page_content` is untyped key-value.** Fine for six static pages; it will not carry a magazine-layout blog, where posts need ordered, typed blocks (full-bleed image, pull quote, image pair, text). Do not extend this table for the blog.
- **Custom CSS injection** from `site_settings` into every page is an unbounded admin-authored `<style>`. Admin-only and therefore low risk, but it should be length-capped and stripped of `</style>` and `@import`.
- **No tests, no CI, no per-route error boundaries.**
- **`.env` is committed and the repo is currently public.** The keys are Supabase *publishable* keys, designed to be public and backed by RLS, so this is not an incident — but the repo should go private again, and RLS is now the only thing standing between the public and the data. It should be verified deliberately, not assumed.

---

## Options considered

### Option A: Rebuild on Next.js for its image pipeline

| Dimension | Assessment |
|---|---|
| Complexity | High — full rewrite of routing, loaders, admin |
| Cost | Vercel free tier is generous; image optimization metered |
| Scalability | Excellent, `next/image` solves P0 outright |
| Team familiarity | Lower — abandons the working TanStack codebase |

**Pros:** `next/image` is best-in-class and would erase the image problem with one import.
**Cons:** Throws away a working, already-debugged application to fix a problem solvable in ~100 lines. Breaks Lovable's sync, which is the operator's visual fallback.

### Option B: Keep the stack, fix the implementation *(recommended)*

| Dimension | Assessment |
|---|---|
| Complexity | Low–medium, incremental, shippable in stages |
| Cost | Free |
| Scalability | Sufficient to tens of thousands of photographs |
| Team familiarity | Highest — same codebase, same mental model |

**Pros:** Every defect above is a contained fix. No migration risk. Keeps Lovable sync intact.
**Cons:** Responsive images must be built by hand rather than imported (~100 lines, one-time).

### Option C: Move media to Cloudinary or Bunny

| Dimension | Assessment |
|---|---|
| Complexity | Low — change one URL builder |
| Cost | Free tier, or ~$10/mo at Bunny |
| Scalability | Excellent; transformation and CDN handled |
| Team familiarity | New account and dashboard to own |

**Pros:** Solves P0 and the egress ceiling permanently, with on-the-fly resizing so derivative sizes need no forethought.
**Cons:** Another service, another bill, another failure mode. Premature at current volume.

## Trade-off analysis

The real decision is **Option B now, Option C later**, and the trigger between them is measurable rather than aesthetic.

Generating three widths in the browser at upload costs three canvas encodes and ~1.4× the storage of a single file. It is free, it keeps everything in one system, and it removes the single largest performance defect. Its limit is inflexibility: adding a fourth breakpoint later means re-processing the archive.

That limit only bites at volume. Cloudinary's on-the-fly transformation is the better end state, but adopting it today means a second account, a second set of credentials, and a second thing to debug, in exchange for flexibility not yet needed.

**Adopt Option C when any of these becomes true:** storage passes ~700 MB, monthly egress passes ~3.5 GB, or the archive passes ~800 photographs. Until then Option B is strictly better for a solo operator.

Option A is rejected outright. The framework is not the problem; four specific implementation choices are.

## Consequences

**What becomes easier**
- Portfolio pages get roughly 8–10× lighter, which is the difference between "slow on phones" and "fast on phones".
- Search engines and social cards see real content, so the work becomes discoverable.
- Free-tier headroom extends from hundreds of page views a month to tens of thousands.
- A smaller component surface makes future Tailwind and Radix upgrades tractable.

**What becomes harder**
- Uploads get slower — three encodes instead of one, a few seconds per photograph on a large batch. Worth it, and it happens once per image rather than once per viewer.
- Route loaders mean content-fetch bugs surface as server errors rather than empty client states, so per-route error boundaries become mandatory rather than optional.

**What we'll need to revisit**
- The image decision at the volume triggers above.
- The content model before the blog is built — `page_content` must not be stretched to cover it.
- Whether RLS genuinely covers every table, verified against the public repo rather than assumed.

## Action items

**P0 — before more features are added**

1. [ ] Generate 640 / 1280 / 2560px WebP derivatives at upload; store paths in a `photos.sources` JSONB column.
2. [ ] Emit a real `srcset` + `sizes` from `Img.tsx` and `JustifiedGallery.tsx`.
3. [ ] Make the `photos` bucket public and serve `/storage/v1/object/public/...` directly; delete `/api/public/photo/$` and its per-request signing call.
4. [ ] Add `cache-control: public, max-age=31536000, immutable` to uploads — paths are already content-unique.
5. [ ] Convert every public route to a `loader` using `queryClient.ensureQueryData`; hydrate on the client.
6. [ ] Derive `og:image` from the hero photograph now that it is known at render time.

**P1 — the following week**

7. [ ] Filter and paginate `photosQuery` server-side; select only needed columns; infinite-scroll the gallery.
8. [ ] Delete the 12 unused shadcn components named above, and `recharts` with them.
9. [ ] Type the Supabase client properly and delete both `any` casts; generate `Photo`/`Category`/etc. from `types.ts`.
10. [ ] Delete `Gallery.tsx`.
11. [ ] Cap and sanitise the custom-CSS field.

**P2 — before launch**

12. [ ] Design typed block content for the blog; do not extend `page_content`.
13. [ ] Per-route error boundaries and a real 404 for unknown categories.
14. [ ] Vitest on `lib/` plus one Playwright smoke test per public route; run both in GitHub Actions.
15. [ ] Make the repository private; verify RLS on every table explicitly.
16. [ ] Rate-limit the `inquiries` insert — it is a public, unauthenticated write path and will attract spam.
