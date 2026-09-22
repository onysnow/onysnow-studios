# ADR-0002: Architecture review after the feature build

**Status:** Proposed
**Date:** 2026-09-22
**Deciders:** Ony Shannon
**Supersedes nothing.** Follow-up to ADR-0001, which was written before the responsive-image, layout-primitive and journal work landed.

## Context

ADR-0001 audited a generated codebase. Since then the site has gained responsive images, layout primitives, a magazine-layout journal, subscribers, a social rail, an inquiry-only duo service and a Cal.com booking embed. This checks what that fixed, what it didn't, and what the new surface area changed.

The headline finding is that **the feature work moved the site's centre of gravity toward content that must be discoverable, while the rendering model that makes content discoverable is still unfixed.** That reprioritises one open item from "important" to "the main thing."

### ADR-0001 action items, verified against the code

| # | Item | Status |
|---|---|---|
| 1 | Generate 640/1280/2560 renditions at upload | **Done** |
| 2 | Emit real `srcset` from `Img` and the gallery | **Done** |
| 3 | Public bucket, delete the signing proxy | **Done** — `src/routes/api` is gone |
| 4 | `cache-control: immutable` on uploads | **Done** |
| 5 | Route loaders so content is server-rendered | **Not done** — home alone fires 6 client queries |
| 6 | Derive `og:image` from the hero | **Not done** — no `og:image` on any route |
| 7 | Filter and paginate `photosQuery` | **Not done**, and now worse — see below |
| 8 | Delete unused shadcn components | **Not done** — still 46, `recharts` still a dependency |
| 9 | Type the Supabase client, drop the `any` casts | **Not done** — 6 remain across `content.ts` and `admin.ts` |
| 10 | Delete the dead `Gallery.tsx` | **Done** |
| 11 | Cap and sanitise custom CSS | **Done** |
| 12 | Typed block content for the blog | **Done** — `posts.blocks` jsonb, not stretched `page_content` |
| 13 | Per-route error boundaries and 404s | **Partial** — journal and duo handle absence; no boundaries |
| 14 | Tests and CI | **Not done** — no config, no workflow |
| 15 | Private repo, verify RLS | **Partial** — RLS is right; repo still public |
| 16 | Rate-limit the inquiry write | **Partial** — length bounds added, no rate limit |

Eight of sixteen closed, including every P0 about image delivery. The unclosed ones cluster around rendering and hygiene.

---

## Findings

### P0 — The journal is invisible to search, and that's now the point

Every public route fetches through `useQuery` in the component. The server ships skeletons; text and images arrive only after JS boots and several round-trips resolve. There is no `og:image` anywhere.

This was a problem in ADR-0001. It is a *different* problem now. Before, it cost you discovery on a brochure site. Now you have a journal designed to be read and shared, a subscribe form that depends on people arriving, and service pages meant to rank. **A blog that search engines index as an empty page is not a blog.** Social cards for posts have no image, which is most of what makes a link worth clicking.

The fix hasn't changed — route loaders with `queryClient.ensureQueryData`, then derive `og:image` from the post cover or hero — but its value has multiplied.

### P0 — `photosQuery` got more load-bearing, not less

```ts
queryFn: () => rows<Photo>("photos", (q) => q.eq("published", true).order("sort_order"))
```

Still `select("*")`, no limit, every published photograph. ADR-0001 flagged it when three pages used it. It is now consumed by the home page, the portfolio, the about page, the journal index, every post, the duo page, and `PostBlocks` — which resolves each block's `photo_id` by scanning the whole array.

So a post displaying four photographs pulls the entire archive, including a base64 blur placeholder per row. At today's six seed images that is nothing. At a working year's output it is several megabytes on every route, and the blog is the page most likely to be shared cold to a phone.

**Coupling the blog renderer to an unbounded whole-table fetch is the piece I'd undo first.** Blocks should resolve their photos by id through a targeted query, not by filtering a global list.

### P1 — Two unauthenticated public write paths, neither rate-limited

`inquiries` and now `subscribers` both accept anonymous inserts. Both have length bounds and a honeypot; neither has a rate limit. That's adequate against casual junk and inadequate against anything automated. A Supabase edge function in front of both, or a per-IP throttle, closes it. Not urgent until the site has traffic — but it becomes urgent the moment it does, which is exactly when you'll be least free to deal with it.

### P1 — Unchanged hygiene debt

46 shadcn components against 18 site components; `recharts` still pulled in for a `chart.tsx` a photography site will never render. Six `any` casts still erase the generated database types, which now describe more tables than before, so the drift risk grew with the schema.

### Opportunity — the effects belong in your registry

`ScrambleText`, `ParallaxScene`, `GlassPanel`, `JustifiedGallery` and `Reveal` are self-contained, have no site-specific coupling, and were each built once here. Your component registry exists precisely so that doesn't happen twice. `ScrambleText` in particular is a genuinely novel effect with per-character timing and width handling that took several iterations to get right — rebuilding that from memory on the next project would be a waste.

They'd need the decontamination pass the registry's own docs describe, and `ScrambleText` carries no third-party derivation, so the licensing constraint holds.

---

## Options considered

### Option A: Convert to route loaders now, defer the rest

| Dimension | Assessment |
|---|---|
| Complexity | Medium — mechanical, route by route |
| Cost | Free |
| Scalability | Fixes the discoverability ceiling outright |
| Risk | Content-fetch failures become server errors, so error boundaries become mandatory |

**Pros:** unblocks SEO and social sharing, improves LCP, makes `og:image` possible at all.
**Cons:** touches every public route at once; needs the error-boundary work done alongside rather than after.

### Option B: Fix the photo query first, loaders after

| Dimension | Assessment |
|---|---|
| Complexity | Low — scoped to the data layer |
| Cost | Free |
| Scalability | Removes the payload cliff |
| Risk | Minimal, contained to `content.ts` and `PostBlocks` |

**Pros:** smallest, safest change; stops the blog dragging the archive behind it.
**Cons:** doesn't help discovery at all, which is the thing the recent work made matter.

### Option C: Do nothing until there's real content

| Dimension | Assessment |
|---|---|
| Complexity | None |
| Cost | Free now, compounding later |
| Scalability | Neither problem self-corrects |
| Risk | Both get harder as routes and photographs multiply |

**Pros:** honest about the fact that six seed photos and one example post make neither problem visible today.
**Cons:** the loader migration gets more expensive with every route added, and the journal accrues no search history in the meantime — and search history is the one thing that can't be backfilled.

## Trade-off analysis

The real question is what the site is *for* over the next few months. If it's a portfolio you send people links to, Option C is defensible and the current state is fine. If the journal is meant to bring strangers in, then every week it runs unindexed is a week of compounding that can't be recovered, and Option A is the only one that addresses it.

Options A and B aren't really in competition — B is half a day and A is a day or two. The sequencing argument is that B is a prerequisite for A being pleasant: converting routes to loaders while every loader drags the whole photo table is fixing the render path on top of a bad fetch path.

**Recommended: B then A, in one sitting.** Together they are the last structural work this codebase needs. Everything else on the list is tidying.

## Consequences

**What becomes easier**
- Posts become shareable in a way that produces clicks, and indexable in a way that compounds.
- The archive can grow to thousands of photographs without any page paying for all of them.
- Once loaders exist, per-route metadata (including `og:image`) has somewhere natural to live.

**What becomes harder**
- Error handling stops being optional: a failed loader is a server error, not an empty client state.
- Local development gets marginally slower to reason about, since data resolution moves server-side.

**What we'll need to revisit**
- Rate limiting, the moment the site gets traffic rather than before.
- The image-CDN triggers from ADR-0001 (700 MB stored, 3.5 GB/month egress, ~800 photographs) — still the right thresholds, still far away.

## Action items

1. [ ] Resolve post-block photographs by id rather than scanning the full `photosQuery` result.
2. [ ] Scope `photosQuery`: select only rendered columns, filter server-side, paginate the gallery.
3. [ ] Convert public routes to loaders with `queryClient.ensureQueryData`; hydrate on the client.
4. [ ] Derive `og:image` per route — post cover, category cover, or hero.
5. [ ] Add per-route error boundaries in the same pass as item 3.
6. [ ] Delete the 12 unused shadcn components and `recharts`.
7. [ ] Type the Supabase client; remove the six `any` casts.
8. [ ] Make the repository private.
9. [ ] Vitest on `lib/`, one Playwright smoke test per public route, both in GitHub Actions.
10. [ ] Rate-limit `inquiries` and `subscribers` — schedule against traffic, not against the calendar.
11. [ ] Harvest `ScrambleText`, `ParallaxScene`, `GlassPanel`, `JustifiedGallery` and `Reveal` into the OnySnow UI registry.
