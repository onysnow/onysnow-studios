import { useEffect, useRef } from "react";
import { watchShutterCharge } from "@/lib/shutter-charge";
import { irisPath, irisSeams } from "@/lib/iris";
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
  const emitRef = useRef<HTMLDivElement>(null);
  const irisRef = useRef<SVGSVGElement>(null);
  const bladesRef = useRef<SVGPathElement>(null);
  const seamsRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;

    const el = ringRef.current;
    const dot = dotRef.current;
    const emit = emitRef.current;
    const iris = irisRef.current;
    if (!el || !dot || !emit || !iris) return;

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
      // The emitter rides with the ring but lives outside the difference layer.
      // Position goes through a custom property: the armed throb animates
      // `transform`, and writing transform directly here would fight it.
      emit.style.setProperty("--emit-transform", el.style.transform);
      if (!emit.hasAttribute("data-armed")) emit.style.transform = el.style.transform;
      iris.style.transform = el.style.transform;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);

    /*
     * Winding the shutter.
     *
     * Moving the pointer hard in one place charges it; the ring brightens as it
     * fills and fades back the moment you stop, so the charge has to be held
     * rather than merely reached. At full it arms, and a click fires — the
     * flash never goes off on its own.
     */
    const charger = watchShutterCharge({
      onCharge: (charge, armed) => {
        el.style.setProperty("--wind", charge.toFixed(2));
        /*
         * The difference-blended ring fades out as the light comes up.
         * Difference inverts, so over a bright warm source the ring rendered
         * blue and sat in the middle of the highlight — a blown core has
         * nothing legible inside it, so the ring gets out of the way.
         */
        el.style.opacity = (1 - charge * 0.92).toFixed(2);
        dot.style.opacity = (1 - charge * 0.92).toFixed(2);
        emit.style.setProperty("--wind", charge.toFixed(2));
        emit.toggleAttribute("data-armed", armed);
        // Blades close over the back half, once it's clearly deliberate.
        const closed = Math.max(0, (charge - 0.5) / 0.5);
        el.style.setProperty("--iris", closed.toFixed(2));
        // The blades are geometry, so they are redrawn rather than restyled.
        iris.style.setProperty("--iris", closed.toFixed(2));
        bladesRef.current?.setAttribute("d", irisPath(closed));
        seamsRef.current?.setAttribute("d", irisSeams(closed));
        el.toggleAttribute("data-winding", charge > 0.06);
        el.toggleAttribute("data-armed", armed);
      },
    });

    const onClick = (event: MouseEvent) => {
      if (!charger.isArmed()) return;
      /*
       * The shutter only fires at a photograph.
       *
       * Firing into empty page does nothing at all — not even spending the
       * charge — so the discovery is "I'm armed, but not here", which points
       * at what to try next. Consuming the charge on a miss would just be
       * punishing.
       */
      /*
       * Resolved fresh from the pointer position rather than read off the last
       * pointermove. Content moves under a stationary cursor — a carousel
       * advancing, the page scrolling — and the cached target goes stale, so
       * clicking a photograph could be judged against whatever happened to be
       * there a moment earlier.
       */
      const under = document.elementFromPoint(targetX, targetY);
      if (!under?.closest("img, picture, video, .gallery-frame")) return;
      /*
       * Swallow the click.
       *
       * Photographs are wrapped in links, so without this the shutter fires
       * and the page immediately navigates away from it. Arming is deliberate
       * and unmistakable — the aperture is closed and pulsing — so a click in
       * that state means "take the photograph", not "follow this link".
       */
      event.preventDefault();
      event.stopPropagation();

      charger.spend();
      fireShutter({ x: targetX, y: targetY });
    };
    // Capture phase so the shutter still fires when the click lands on a link.
    window.addEventListener("click", onClick, true);

    return () => {
      charger.stop();
      window.removeEventListener("click", onClick, true);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, []);

  return (
    <>
      {/*
        The emitter is a SEPARATE element from the ring, and that separation is
        the whole point. The cursor blends with `difference`, which inverts what
        is beneath it — a subtraction. Light is additive, so no amount of
        brightness inside a difference layer will ever read as something
        emitting; it just inverts harder. This sits outside that layer and
        blends with `plus-lighter`, which genuinely adds photons to what is
        behind it, the way an LED does.
      */}
      <div ref={emitRef} aria-hidden="true" className="cursor-emit" />
      {/*
        The diaphragm, also outside the difference layer. Inside it, white
        blades over the warm emitter inverted to blue — the blades are supposed
        to be dark metal silhouetted against the light coming through the hole,
        which only works with normal blending.
      */}
      <svg ref={irisRef} className="cursor-iris" viewBox="0 0 100 100" aria-hidden="true">
        <path ref={bladesRef} className="cursor-iris__blades" fillRule="evenodd" d={irisPath(0)} />
        <path ref={seamsRef} className="cursor-iris__seams" d={irisSeams(0)} />
      </svg>
      <div ref={ringRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__ring" />
        {/* A real diaphragm: a polygonal hole that shrinks and rotates. */}
        <svg className="custom-cursor__iris" viewBox="0 0 100 100" aria-hidden="true">
          <path
            ref={bladesRef}
            className="custom-cursor__blades"
            fillRule="evenodd"
            d={irisPath(0)}
          />
          <path ref={seamsRef} className="custom-cursor__seams" d={irisSeams(0)} />
        </svg>
      </div>
      <div ref={dotRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__dot" />
      </div>
    </>
  );
}
