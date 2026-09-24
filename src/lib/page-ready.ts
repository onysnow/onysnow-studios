/**
 * When the page is worth looking at.
 *
 * "Loaded" is a choice, not a fact. Waiting for everything means staring at a
 * loader while photographs three screens down decode; revealing at first paint
 * means watching the first screen assemble itself. The line drawn here is
 * EVERYTHING ABOVE THE FOLD: the fonts, every image that is actually on
 * screen, and one painted frame. Lower sections stream in as they are scrolled
 * to, which is what streaming is for.
 *
 * THE TIMEOUT IS NOT A DETAIL
 *
 * Every condition below can fail to resolve. An image can 404, a font can hang
 * behind a slow CDN, a decode can reject on a corrupt file. A loading screen
 * that waits forever is strictly worse than no loading screen, because the
 * site becomes unreachable rather than merely ugly. So the whole thing races a
 * hard deadline and reveals regardless. A guard that cannot fail open is not a
 * guard.
 */

/** Never hold the page longer than this, whatever is still outstanding. */
const DEADLINE_MS = 6000;

function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Images intersecting the viewport right now.
 *
 * Read once, at call time, rather than watched: the question is what is on
 * screen when the page opens, and the answer must not keep changing as
 * reveal animations move things around underneath us.
 */
function aboveTheFold(): HTMLImageElement[] {
  const h = document.documentElement.clientHeight || window.innerHeight;
  const w = document.documentElement.clientWidth || window.innerWidth;
  return [...document.images].filter((img) => {
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return r.top < h && r.bottom > 0 && r.left < w && r.right > 0;
  });
}

/**
 * Resolve when an image is painted, or when it is clear it never will be.
 *
 * `decode()` rejects on a broken or cross-origin-tainted image, and a rejected
 * decode is a perfectly good reason to stop waiting -- the page should open
 * with a missing photograph, not refuse to open at all. So every path here
 * resolves; none reject.
 */
function settled(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) {
    return img.decode().then(
      () => undefined,
      () => undefined,
    );
  }
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

export type ReadyReport = {
  /** Milliseconds actually waited. */
  ms: number;
  /** How many above-the-fold images were waited on. */
  images: number;
  /** True if the deadline fired before everything settled. */
  timedOut: boolean;
};

/**
 * Wait for the first screen, then resolve. Never rejects, never hangs.
 */
export function whenFirstScreenReady(deadlineMs = DEADLINE_MS): Promise<ReadyReport> {
  const started = performance.now();

  if (typeof document === "undefined") {
    return Promise.resolve({ ms: 0, images: 0, timedOut: false });
  }

  const images = aboveTheFold();

  const work = Promise.all([
    // `document.fonts.ready` is already resolved on a warm cache, so this is
    // usually free; it is the cold first visit it exists for.
    document.fonts?.ready ?? Promise.resolve(),
    ...images.map(settled),
  ])
    // One more frame after the last decode, so the reveal lands on a painted
    // page rather than on the frame that is still compositing it.
    .then(afterTwoFrames)
    .then(() => false);

  const deadline = new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(true), deadlineMs);
  });

  return Promise.race([work, deadline]).then((timedOut) => ({
    ms: Math.round(performance.now() - started),
    images: images.length,
    timedOut,
  }));
}
