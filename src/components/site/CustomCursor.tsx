import { reportCharge } from "@/lib/edge-glow";
import { useEffect, useRef } from "react";
import { watchShutterCharge } from "@/lib/shutter-charge";
import { CursorLight } from "./CursorLight";
import { GlassLight } from "./GlassLight";
import { FlareOverlay } from "./FlareOverlay";
import { fireShutter } from "./ShutterFlash";
import {
  playShutterClick,
  playShutterFlash,
  primeShutterAudio,
  setShutterCharge,
} from "@/lib/shutter-audio";

/**
 * A photograph the pointer is directly on top of.
 */
const PHOTO = "img, picture, video, .gallery-frame";

/**
 * A photographic *surface* — a hero or parallax band where the picture is the
 * background and scrims, vignettes and copy are stacked over it. A hit test
 * there lands on one of those overlays, never on the image, so the container
 * carries `data-photo` and stands in for it.
 */
const PHOTO_SCENE = "[data-photo]";

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
  const chargeRef = useRef(0);
  const closedRef = useRef(0);
  const lightPos = useRef({ x: 0, y: 0 });
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
      const media = node?.closest?.(PHOTO);
      const scene = node?.closest?.(PHOTO_SCENE);

      /*
       * Photographs win over links; photographic *scenes* lose to them.
       *
       * Nearly every photograph on the site is wrapped in something clickable —
       * a lightbox trigger, a card link — so testing for `interactive` first
       * meant the media state almost never fired. What's under the pointer
       * matters more than what it does: over a picture you want the wide
       * negative lens, over a line of text the smaller disc that sits behind it.
       *
       * A scene is the other way round. The hero is a photograph, but it also
       * carries the headline and both calls to action, and those sit *on* the
       * picture rather than in it. Over one of them the link state is the
       * truthful one; the wide lens only takes over where the picture is bare.
       */
      const state = media ? "media" : interactive ? "link" : scene ? "media" : "default";
      if (el.dataset["state"] !== state) {
        el.dataset["state"] = state;
        dot.dataset["state"] = state;
      }
    };

    /*
     * Two independent reasons the negative can be hidden — the pointer has left
     * the window, and the shutter is winding — so both go through one function.
     * Setting `style.opacity` from either handler on its own meant whichever
     * fired last won: re-entering the window mid-charge snapped the ring back
     * to full over the middle of the light.
     */
    let inside = true;
    const applyVisibility = () => {
      /*
       * The follower never goes away.
       *
       * An earlier version faded it out as the charge came up, on the grounds
       * that a difference-blended ring over a blown highlight reads as a hole
       * punched through it. That was solving the wrong problem: the fix is for
       * the ring to stop being a filled disc, not for it to vanish. Winding is
       * meant to be the ring TRANSFORMING — tightening, brightening, closing
       * into an iris — and there is nothing to transform if it has gone.
       *
       * Leaving the window is the only thing that hides it.
       */
      const value = inside ? 1 : 0;
      el.style.opacity = value.toFixed(2);
      dot.style.opacity = value.toFixed(2);
    };

    const onLeave = () => {
      inside = false;
      applyVisibility();
    };
    const onEnter = () => {
      inside = true;
      applyVisibility();
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
    /*
     * Measured off the reference rather than chosen.
     *
     * bryanminear.com moves both circles with CSS transitions -- 0.125s ease
     * on the ring, 0.1s on the dot. That is a 1.25x difference, not the 4x I
     * had, which is the whole reason his never looks off-centre and mine did:
     * at 0.13 and 0.55 the dot ran four times ahead of the ring and the light,
     * and the faster you moved the further they came apart.
     *
     * Converted to per-frame lerps that settle in about the same time.
     */
    const RING_EASE = 0.38;
    const DOT_EASE = 0.46;

    const tick = () => {
      ringX += (targetX - ringX) * RING_EASE;
      ringY += (targetY - ringY) * RING_EASE;
      dotX += (targetX - dotX) * DOT_EASE;
      dotY += (targetY - dotY) * DOT_EASE;

      el.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
      // The emitter rides with the ring but lives outside the difference layer.
      // The shader reads these; it runs its own loop.
      lightPos.current.x = ringX;
      lightPos.current.y = ringY;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    /*
     * Browsers refuse to let a page make a sound until somebody has clicked or
     * typed, and winding is neither — it is pointer movement, which does not
     * count. That restriction happens to be doing something useful, so it is
     * honoured rather than worked around: nothing makes a noise until the
     * visitor has chosen to interact at least once.
     */
    window.addEventListener("pointerdown", primeShutterAudio, { once: true });
    window.addEventListener("keydown", primeShutterAudio, { once: true });
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
        dot.style.setProperty("--wind", charge.toFixed(2));
        /*
         * And on the root, because the glass needs it too. At rest a pane
         * holds only the faintest reflection and its edge is a hairline; the
         * light is what reveals both. That has to be a CSS custom property,
         * since the layers doing the revealing are CSS, not the shader.
         */
        document.documentElement.style.setProperty("--wind", charge.toFixed(2));
        chargeRef.current = charge;
        reportCharge(charge);
        setShutterCharge(charge);
        // Blades close over the back half, once it's clearly deliberate.
        const closed = Math.max(0, (charge - 0.5) / 0.5);
        el.style.setProperty("--iris", closed.toFixed(2));
        closedRef.current = closed;
        el.toggleAttribute("data-winding", charge > 0.06);
        el.toggleAttribute("data-armed", armed);
      },
    });

    const onClick = (event: MouseEvent) => {
      /*
       * Resolved fresh from the pointer position rather than read off the last
       * pointermove. Content moves under a stationary cursor — a carousel
       * advancing, the page scrolling — and the cached target goes stale, so
       * clicking a photograph could be judged against whatever happened to be
       * there a moment earlier.
       */
      const under = document.elementFromPoint(targetX, targetY);
      const atPhoto = !!under?.closest(`${PHOTO}, ${PHOTO_SCENE}`);

      /*
       * The shutter only FIRES at a photograph, and only when wound — but it
       * always makes a noise. A camera clicks whether or not there is film in
       * it, and the mechanism answering every click is what tells you the
       * thing in your hand is a camera at all.
       *
       * Firing into empty page does nothing else — not even spending the
       * charge — so the discovery is "I'm armed, but not here", which points
       * at what to try next. Consuming the charge on a miss would just be
       * punishing.
       */
      if (!charger.isArmed() || !atPhoto) {
        playShutterClick();
        /*
         * And the blades move, because they do on a real camera.
         *
         * The sound was already firing on every click -- the mechanism
         * answering is what tells you the thing in your hand is a camera --
         * but the cursor sat there unmoved, so the click read as a sound
         * effect bolted onto a pointer rather than as a shutter.
         *
         * Removed and re-set around a forced reflow, which is what restarts a
         * CSS animation; without it a second click inside the same 170ms does
         * nothing, and rapid clicking is exactly when you notice.
         */
        el.removeAttribute("data-click");
        void el.offsetWidth;
        el.setAttribute("data-click", "");
        return;
      }
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
      playShutterFlash();
      fireShutter({ x: targetX, y: targetY });
    };
    // Capture phase so the shutter still fires when the click lands on a link.
    window.addEventListener("click", onClick, true);

    return () => {
      charger.stop();
      window.removeEventListener("click", onClick, true);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", primeShutterAudio);
      window.removeEventListener("keydown", primeShutterAudio);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, []);

  return (
    <>
      {/*
        The light is a WebGL canvas, not CSS.

        It has to be: the blown core depends on emission exceeding 1.0 and
        being tonemapped back down, and CSS composites in SDR where nothing can
        exceed white. Every gradient version of this ended up as an orange
        aura with a white dot in the middle, because that is the most a
        gradient can express.
      */}
      {/*
        The glass sits UNDER the cursor light, both in z-order and in fact: it
        is the light landing on the panels, so it cannot be brighter than the
        source of it.
      */}
      <GlassLight chargeRef={chargeRef} positionRef={lightPos} />
      {/* Real footage, for the parts of a flare that synthesis cannot reach. */}
      <FlareOverlay chargeRef={chargeRef} positionRef={lightPos} />
      <CursorLight chargeRef={chargeRef} closedRef={closedRef} positionRef={lightPos} />
      <div ref={ringRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__ring" />
        {/*
        A real six-blade iris, for the click.

        Each blade pivots about a point ON THE HOUSING RING and swings
        inward -- that is what a leaf shutter does, and it is why the
        opening is a hexagon: six straight inner edges sweeping across one
        another. Rotating blades about the CENTRE instead, which is what
        every snippet of this going around does, spins a pinwheel and
        never produces the polygon.

        All six share one rotation, so one keyframe animates the lot; only
        the pivot differs, and that is static per blade.
      */}
        <svg
          className="custom-cursor__iris"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <clipPath id="cursor-iris-housing">
            <circle cx="50" cy="50" r="46" />
          </clipPath>
          <g clipPath="url(#cursor-iris-housing)">
            <g key={0} transform="rotate(0 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={1} transform="rotate(45 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={2} transform="rotate(90 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={3} transform="rotate(135 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={4} transform="rotate(180 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={5} transform="rotate(225 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={6} transform="rotate(270 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
            <g key={7} transform="rotate(315 50 50)">
              <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
            </g>
          </g>
        </svg>
      </div>
      <div ref={dotRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__dot" />
      </div>
    </>
  );
}
