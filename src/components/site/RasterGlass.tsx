import { useEffect } from "react";

/**
 * The panes, refracting a rasterised copy of the page behind them.
 *
 * WHAT THIS IS INSTEAD OF
 *
 * The other glass is `backdrop-filter` plus an SVG displacement map. That gets
 * the real backdrop from the compositor for free, and can blur it or push it
 * around — but it can never answer "what colour is the page at some OTHER
 * point", and that question is the whole of refraction. A ray entering glass
 * bends, travels through the body, and leaves somewhere else; the pixel you
 * see at x came from somewhere that is not x. A filter cannot do that because
 * it never has the backdrop as sampleable pixels.
 *
 * ybouane/liquidglass (MIT) solves it the only way it can be solved: rasterise
 * the page into a texture with html-to-image and let a fragment shader sample
 * it. This is that library, used as itself rather than reimplemented — its
 * capture, its cache invalidation, its shader, its compositing.
 *
 * WHY ONE INSTANCE PER SECTION
 *
 * The library's contract is that glass elements are direct children of `root`,
 * because it captures each non-glass child separately so it can z-order them
 * and composite each pane's output back before the next pane renders. Capture
 * a subtree that CONTAINS a pane and that pane ends up refracting a picture of
 * itself, and on the next capture, a picture of itself refracting itself.
 *
 * On this site every pane is a direct child of its own section wrapper, with
 * that section's background as its sibling. So the contract already holds, one
 * section at a time. Panes in different sections do not overlap, so nothing is
 * lost by not compositing them together.
 *
 * THE HEADER IS DELIBERATELY NOT INCLUDED
 *
 * It is `position: fixed` over the whole scrolling document, so "the page
 * behind it" changes on every scroll frame. A cached capture is exactly the
 * wrong shape for that, and re-capturing the document per frame is nowhere
 * near 60fps. It keeps `backdrop-filter`, which handles that case for nothing.
 * That is a real split and worth naming rather than discovering later.
 */

/** Panes the rasteriser takes over. The fixed header is not one of them. */
const RASTER_PANES = ".glass:not(.glass--bar)";

type Instance = { destroy: () => void };

/*
 * NO configuration. Upstream's defaults, exactly as the library ships them.
 *
 * The first two attempts passed a `defaults` object of my own -- cornerRadius
 * 18, zRadius 14, a blur amount -- reasoning about what these panes "should"
 * want. That was the wrong move twice over. It is wrong as a method, because
 * the whole point of vendoring this was to get it RUNNING as itself before
 * changing anything, and it is wrong in fact: upstream's 65/40 are sized so
 * the bevel is a large fraction of the element, and every term that makes
 * this read as glass lives on the bevel. Across the flat face the surface
 * normal is exactly (0, 0, 1), so refraction, fresnel and all four speculars
 * evaluate to zero. A 14px bevel on a 1440px band is 1% glass and 99%
 * blurred rectangle, which is precisely what it looked like.
 *
 * So: nothing is passed. What renders is what the library renders. Tuning
 * comes after it is known to work, and against what it actually looks like
 * rather than against an argument about what it ought to look like.
 */

export function RasterGlass({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // The effect layer is already gated off on phones; eighteen blurs was too
    // much there and a per-pane WebGL context with a rasterised texture is
    // considerably more.
    if (window.matchMedia("(pointer: coarse), (hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let live = true;
    const instances: Instance[] = [];

    /*
     * Marks the document so the stylesheet can stand down.
     *
     * Two glass systems painting the same pane would be two bevels, two
     * reflections and two blurs over each other. The CSS side reads this
     * attribute and drops the parts the shader now owns.
     */
    document.documentElement.dataset["glass"] = "raster";

    /*
     * One pane at a time, and only once it has a size.
     *
     * The first attempt initialised all five in a loop on mount. Four of them
     * reported 0x0: the sections below the fold are sized from content that
     * has not arrived yet, so the panes exist in the DOM with no box. The
     * library measures the element to build its bevel and its capture, so a
     * zero-sized pane produces a zero-sized everything, silently, and the
     * page ends up with one working pane and four that never appear.
     *
     * A ResizeObserver is the right instrument rather than IntersectionObserver
     * -- what matters is that the element HAS a box, not that the box is on
     * screen, and a pane can be laid out long before it is scrolled to.
     */
    const started = new WeakSet<HTMLElement>();
    let chain: Promise<void> = Promise.resolve();

    const initPane = (pane: HTMLElement) => {
      if (started.has(pane)) return;
      const rect = pane.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const root = pane.parentElement;
      if (!root) return;
      started.add(pane);

      // Serialised. Each init runs a full html-to-image capture of the
      // section behind it; five of those at once competes for the main
      // thread at exactly the moment the page is trying to finish loading.
      chain = chain.then(async () => {
        if (!live) return;
        try {
          const { LiquidGlass } = await import("@/lib/liquidglass");
          if (!live) return;
          const instance = await LiquidGlass.init({
            root,
            glassElements: [pane],
          });
          if (!live) {
            instance.destroy();
            return;
          }
          instances.push(instance);
        } catch (err) {
          // One pane failing must not take the others with it, and must not
          // leave the page with no glass at all.
          console.warn("[RasterGlass] pane failed:", String(err).slice(0, 200));
          started.delete(pane);
        }
      });
    };

    const panes = Array.from(document.querySelectorAll<HTMLElement>(RASTER_PANES));
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) initPane(entry.target as HTMLElement);
    });
    for (const pane of panes) {
      sizes.observe(pane);
      initPane(pane);
    }

    return () => {
      live = false;
      sizes.disconnect();
      for (const instance of instances) {
        try {
          instance.destroy();
        } catch {
          /* already gone */
        }
      }
      delete document.documentElement.dataset["glass"];
    };
  }, [enabled]);

  return null;
}
