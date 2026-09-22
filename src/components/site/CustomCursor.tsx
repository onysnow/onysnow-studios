import { useEffect, useRef } from "react";
import { watchCircleGesture } from "@/lib/circle-gesture";
import { fireShutter } from "./ShutterFlash";

/**
 * The cursor.
 *
 * A single element that follows the pointer in `mix-blend-mode: difference`.
 * That one choice does all the work: over a photograph the disc inverts what's
 * underneath and reads as a negative, and over text it knocks the letters out
 * rather than covering them. No per-surface styling, no second element for
 * images — the blend mode handles every background the site has.
 *
 * Three states:
 *   default — a thin ring with a dot at its centre
 *   link    — a filled disc, sized to sit behind a nav item or button
 *   media   — a wider ring over photographs, so the frame stays readable
 *
 * Deliberately absent on touch and for anyone who has asked for reduced motion:
 * there is no pointer to follow in the first case, and a lagging element chasing
 * the cursor is exactly the kind of movement that setting is asking us to drop.
 */
export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;

    const el = ringRef.current;
    const dot = dotRef.current;
    if (!el || !dot) return;

    // The native cursor is hidden only once we know we're replacing it, so a
    // failure above leaves the visitor with a working pointer.
    document.documentElement.classList.add("has-custom-cursor");
    el.style.opacity = "1";
    dot.style.opacity = "1";

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    // Two followers at different rates. The ring is the one that visibly trails;
    // the dot sits almost on the pointer, and the gap between them is what makes
    // the ring read as catching up rather than as lag.
    let ringX = targetX;
    let ringY = targetY;
    let dotX = targetX;
    let dotY = targetY;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;

      const node = event.target as Element | null;
      // A link, a button, or anything the site has made behave like one.
      const interactive = node?.closest?.(
        'a, button, [role="button"], input, textarea, select, label, summary',
      );
      const media = node?.closest?.("img, picture, video, .gallery-frame");

      /*
       * Photographs win over links.
       *
       * Nearly every photograph on the site is wrapped in something clickable —
       * a lightbox trigger, a card link — so testing for `interactive` first
       * meant the media state almost never fired. What's under the pointer
       * matters more than what it does: over a picture you want the wide
       * negative lens, over a line of text the smaller disc that sits behind it.
       */
      const state = media ? "media" : interactive ? "link" : "default";
      if (el.dataset["state"] !== state) {
        el.dataset["state"] = state;
        dot.dataset["state"] = state;
      }
    };

    const onLeave = () => {
      el.style.opacity = "0";
      dot.style.opacity = "0";
    };
    const onEnter = () => {
      el.style.opacity = "1";
      dot.style.opacity = "1";
    };

    /*
     * Eased toward the pointer rather than pinned to it.
     *
     * Each frame closes a fixed fraction of the remaining distance, so the
     * follower moves fastest when it is furthest behind and decelerates as it
     * converges — it never overshoots, and it always ends up exactly on the
     * pointer once you stop moving. That acceleration curve is the whole effect;
     * pinning the element to the pointer event instead makes it feel stuck to
     * the glass, and a constant speed makes it feel mechanical.
     *
     * The loop only ever writes `transform`, so it stays on the compositor.
     */
    const RING_EASE = 0.13;
    const DOT_EASE = 0.55;

    const tick = () => {
      ringX += (targetX - ringX) * RING_EASE;
      ringY += (targetY - ringY) * RING_EASE;
      dotX += (targetX - dotX) * DOT_EASE;
      dotY += (targetY - dotY) * DOT_EASE;

      el.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);

    /*
     * Circling winds the iris shut, and completing a turn fires the shutter.
     *
     * Progress drives the blades through a custom property rather than React
     * state: this updates on every pointer move, and re-rendering the cursor
     * at that rate to change one number would be absurd.
     */
    const stopGesture = watchCircleGesture({
      onProgress: (p) => {
        /*
         * Two separate signals, deliberately.
         *
         * `--wind` is the raw turn and drives the ring's glow, which starts
         * almost immediately and brightens the whole way round. That glow is
         * the discovery mechanism: it tells someone who has started circling
         * by accident that circling *does* something, without the page having
         * to announce it. Eased so a stray bit of rotation is a faint shimmer
         * rather than a flare.
         *
         * `--iris` is gated to the back half and closes the blades. By then
         * the gesture is unambiguous and this reads as "about to fire".
         */
        el.style.setProperty("--wind", (p * p).toFixed(3));
        const shown = Math.max(0, (p - 0.5) / 0.5);
        el.style.setProperty("--iris", shown.toFixed(3));
        const winding = p > 0.12;
        if (el.hasAttribute("data-winding") !== winding) {
          el.toggleAttribute("data-winding", winding);
        }
      },
      onComplete: () => {
        el.style.setProperty("--iris", "0");
        el.style.setProperty("--wind", "0");
        el.removeAttribute("data-winding");
        fireShutter({ x: targetX, y: targetY });
      },
    });

    return () => {
      stopGesture();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, []);

  return (
    <>
      <div ref={ringRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__ring" />
        {/* Iris blades, drawn only while a circle is being wound. */}
        <span className="custom-cursor__iris" />
      </div>
      <div ref={dotRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__dot" />
      </div>
    </>
  );
}
