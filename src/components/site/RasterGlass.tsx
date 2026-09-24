import { useEffect } from "react";

import { applyGlassConfig } from "@/lib/tuning";

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
 * What the rasteriser takes over, and what it leaves alone.
 *
 * THE SECTION BANDS, YES. They contain photographs and sit on a parallax
 * scene, so there is something real behind them to bend. Measured on the
 * scene canvas behind one: mean luma 30.2, max 221.7 out of 255.
 *
 * THE FIXED HEADER, NO -- and this is a reversal.
 *
 * I argued originally that a cached capture is the wrong shape for an element
 * with the whole scrolling document behind it, then included it anyway
 * because it was the one place the effect looked right in a screenshot. It
 * does not survive scrolling: the bar smears, because it is refracting a
 * picture of a page that has since moved. Three other complaints came from
 * the same decision -- the pill corners it inherits from upstream's defaults,
 * and the room reflection disappearing behind the injected canvas, which sits
 * at z-index -1 above the reflection layer at -4.
 *
 * The CSS glass handles a fixed bar correctly and for nothing, because
 * backdrop-filter gets its backdrop from the compositor every frame rather
 * than from a snapshot. Doing this properly means re-capturing on scroll,
 * which is a full-document rasterisation per scroll frame; that is not a
 * tuning problem, it is the wrong architecture for this element.
 *
 * THE SMALL CONTROLS, NO. The switch is a 2rem circle and the menu is a
 * dropdown. Both carry `.glass` so the CSS treatment applies, and I had
 * reasoned that letting the shader take the switch over was a neat way to
 * show the difference. In practice the library injects a SQUARE canvas as the
 * first child, and `.glass` has no overflow rule to clip it -- so a square
 * appeared over the circular button. Refracting through a 32px disc gains
 * nothing and costs a capture and a GL context.
 */
const RASTER_PANES =
  ".glass:not(.glass--bar):not(.glass-toggle):not(.dev-nav__menu):not(.site-loader__pane)";

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
          });
          if (!live) {
            instance.destroy();
            return;
          }
          instances.push(instance);

          /*
           * THE CSS GLASS COMES OFF THIS PANE NOW.
           *
           * This is the difference between liquid glass and something that
           * merely sits where liquid glass should be.
           *
           * The pane carries `backdrop-filter: blur(26px) saturate(1.5)` for
           * CSS mode. Left on underneath the shader, it blurs the backdrop to
           * an even colour wash BEFORE anything refracts it -- and because
           * liquidglass rasterises the page behind the pane itself, and
           * html-to-image does not reproduce backdrop-filter, the shader is
           * refracting the SHARP page and compositing that over the BLURRED
           * one. Two glass systems stacked, and the CSS one wins the look,
           * which is why every liquid knob felt like it was doing nothing.
           *
           * It is also pure waste: a full-width backdrop blur is among the
           * most expensive things a compositor can be asked for, and in this
           * mode its result is covered by the canvas.
           *
           * Marked only once init has SUCCEEDED, so a pane whose capture
           * fails keeps its CSS glass and still looks like glass, rather than
           * turning into a transparent hole.
           */
          pane.dataset["liquid"] = "on";

          /*
           * Hand the pane whatever the tuning panel currently holds.
           *
           * The knobs live in one place for both glass systems, and the
           * rasterised one reads them from `data-config`. Writing it here
           * means a pane that mounts late -- these initialise one at a time as
           * each gets a box -- picks up the current settings rather than
           * upstream's defaults, without the panel having to know a new pane
           * appeared.
           */
          applyGlassConfig();
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
          delete pane.dataset["liquid"];
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
      /*
       * Give every pane its CSS glass back.
       *
       * Switching to CSS mode tears this down, and a pane left marked would
       * keep its backdrop-filter suppressed -- a transparent hole where the
       * glass should be, in the mode whose whole job is the CSS glass.
       */
      for (const pane of document.querySelectorAll<HTMLElement>("[data-liquid]")) {
        delete pane.dataset["liquid"];
      }
      delete document.documentElement.dataset["glass"];
    };
  }, [enabled]);

  return null;
}
