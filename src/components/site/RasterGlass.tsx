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

/**
 * What the rasteriser takes over.
 *
 * THE HEADER IS THE POINT, AND THE BANDS MAY NOT BE.
 *
 * Measured, on the scene canvas the shader actually samples behind a section
 * band: 1480x382, mean luma 13.1, max luma 54 out of 255. Six soft bokeh
 * discs on black and nothing else. That is not a tuning problem and no
 * parameter fixes it -- refraction is a LENS, and a lens over a black field
 * shows black however good the lens is.
 *
 * The reason is structural. These bands CONTAIN their photographs; the
 * pictures are children of the pane, so they are correctly excluded from the
 * capture and correctly drawn on top of the shader output. There is nothing
 * behind the glass because the glass is a container, not an overlay.
 *
 * The header is the opposite and is the case this effect exists for: a bar
 * floating over the whole scrolling document, with the photography passing
 * underneath it. That is where a lens has something to bend.
 *
 * Its root is the body, which is expensive -- the capture is the full
 * document -- but it is cached and only re-taken when the content changes,
 * and scrolling does not change it. Scrolling moves the sample WINDOW, not
 * the scene.
 */
const RASTER_PANES = ".glass";

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
      /*
       * The root is the element that holds the thing this pane is glass OVER.
       *
       * For a band that is the ParallaxScene container: the photograph is a
       * direct child of it, and the pane is nested two levels down inside it.
       * Using the pane's immediate parent instead gave a scene of bokeh on
       * black -- mean luma 13 out of 255 -- because the photograph was not in
       * it. Nesting is supported in our copy of the library; see the LOCAL
       * notes on _topLevelChildFor and _composeSceneForGlass.
       *
       * The fixed header has no such container, so it falls back to the body
       * and gets the whole scrolling document as its scene, which is exactly
       * what a bar floating over the page should refract.
       */
      const root = pane.closest<HTMLElement>("[data-photo]") ?? pane.parentElement ?? document.body;
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
            /*
             * The bands run straight across.
             *
             * Upstream's 65px corner is an iOS pill and it is right for the
             * header, which is a floating bar. The section bands are
             * full-bleed edge to edge, so a rounded corner there invents a
             * shape the layout does not have. The BEVEL is untouched -- a
             * square-edged slab of glass still has a rounded-over arris, and
             * that arris is where every optical term in the shader lives.
             */
            ...(pane.classList.contains("glass--bar") ? {} : { defaults: { cornerRadius: 0 } }),
          });
          if (!live) {
            instance.destroy();
            return;
          }
          instances.push(instance);
          /*
           * A handle in dev, so the scene the shader samples can actually be
           * looked at. Debugging this blind is how the white-scene bug
           * survived three rounds of guessing at parameters.
           */
          if (import.meta.env.DEV) {
            (window as unknown as { __liquidglass?: unknown[] }).__liquidglass = instances;
          }
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
