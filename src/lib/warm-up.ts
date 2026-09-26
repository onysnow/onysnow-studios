/**
 * Everything the loader fetches before it lets you in.
 *
 * `page-ready.ts` waits for the first screen: fonts, the images you can see,
 * one painted frame. On a warm cache that is done almost before the loader
 * paints, so the loader opened straight onto "Click to enter" and the wait it
 * was built to fill never happened. The dead time it was meant to spend was
 * spent later instead -- on the first click into Portfolio, the first scroll
 * past the fold, the first charge of the shutter.
 *
 * So this moves that time to the front, where it is on screen and something
 * is there to play with:
 *
 *   ROUTES      The code and data for every page in the main nav. TanStack
 *               Router's preloadRoute loads the route's chunk AND runs its
 *               loader, so the queries are in the cache too and the first
 *               navigation renders without waiting on either.
 *   PHOTOGRAPHS Every image on this page, including the lazy ones below the
 *               fold. Warmed through an off-screen Image carrying the same
 *               srcset and sizes, so the browser picks the same file it will
 *               pick when the real one scrolls into view -- and that file is
 *               then already in the HTTP cache and decoded.
 *   EFFECTS     The smudge-and-scratch map, the lens-flare clips and the
 *               shutter sounds. Small, but each one was a visible hitch the
 *               first time its effect fired.
 *
 * NOTHING HERE CAN KEEP YOU OUT
 *
 * Every task resolves -- a failed fetch or a rejected decode counts as done --
 * and the whole thing is raced against a deadline by the caller. A warm-up is
 * an optimisation. A site that will not open because a flare clip 404'd would
 * be a bug.
 */

import type { AnyRouter } from "@tanstack/react-router";

import { assetUrl, SITE_ASSETS } from "./site-assets";

/** The pages worth having ready before the first click: the main nav. */
const ROUTES = ["/portfolio", "/journal", "/about", "/services", "/contact", "/book"] as const;

const FLARES = ["streak-blue", "streak-green", "beam", "chroma"] as const;
const SOUNDS = ["/sfx/shutter-click.mp3", "/sfx/shutter-flash.mp3", "/sfx/flash-charge.mp3"];

export type WarmProgress = { done: number; total: number };

/** Resolve whatever happens. */
function settle(p: Promise<unknown>): Promise<void> {
  return p.then(
    () => undefined,
    () => undefined,
  );
}

/** Into the HTTP cache, bytes and all. */
function fetchFile(url: string): Promise<void> {
  return settle(fetch(url).then((r) => r.arrayBuffer()));
}

/**
 * Warm an <img> the way the browser will eventually load it.
 *
 * `loading="lazy"` images have no currentSrc until they near the viewport, so
 * their srcset/sizes are copied onto an off-DOM Image instead. Same inputs,
 * same candidate chosen, same URL cached.
 */
function warmImage(img: HTMLImageElement): Promise<void> {
  const src = img.getAttribute("src");
  const srcset = img.getAttribute("srcset");
  if (!src && !srcset) return Promise.resolve();
  const probe = new Image();
  probe.decoding = "async";
  const sizes = img.getAttribute("sizes");
  if (sizes) probe.sizes = sizes;
  if (srcset) probe.srcset = srcset;
  if (src) probe.src = src;
  return settle(probe.decode());
}

function flareUrl(name: string): string {
  // The same choice FlareOverlay's <source> list makes: WebM where it plays.
  const webm = document.createElement("video").canPlayType("video/webm") !== "";
  return `/flares/${name}.${webm ? "webm" : "mp4"}`;
}

/**
 * Start every task and report as each one lands. Never rejects.
 */
export function warmSite(
  router: AnyRouter,
  onProgress?: (p: WarmProgress) => void,
): Promise<WarmProgress> {
  if (typeof document === "undefined") return Promise.resolve({ done: 0, total: 0 });

  const here = window.location.pathname;
  const tasks: Promise<void>[] = [
    ...ROUTES.filter((to) => to !== here).map((to) =>
      settle(router.preloadRoute({ to } as Parameters<AnyRouter["preloadRoute"]>[0])),
    ),
    ...[...document.images].map(warmImage),
    fetchFile(assetUrl(SITE_ASSETS.glassSurface)),
    fetchFile(assetUrl(SITE_ASSETS.glassSmudge)),
    fetchFile(assetUrl(SITE_ASSETS.glassScratch)),
    ...FLARES.map((name) => fetchFile(flareUrl(name))),
    ...SOUNDS.map(fetchFile),
  ];

  const progress: WarmProgress = { done: 0, total: tasks.length };
  onProgress?.({ ...progress });
  for (const task of tasks) {
    void task.then(() => {
      progress.done += 1;
      onProgress?.({ ...progress });
    });
  }
  return Promise.all(tasks).then(() => ({ ...progress }));
}
