import { useEffect, useRef } from "react";
import { flashPanels } from "@/lib/edge-glow";

/**
 * The shutter firing: one flash across the page, corner frame lines, and the
 * frosted panels answering the light with a glare and a rim flare.
 *
 * Exposed through a window event rather than props so the cursor — which owns
 * the gesture that triggers this — doesn't need a reference to it. Anything
 * else that should fire the shutter later can dispatch the same event.
 *
 * A full-screen luminance jump is a photosensitivity hazard, so this is a
 * single rise-and-decay rather than a strobe, the gesture that fires it has a
 * cooldown, and under `prefers-reduced-motion` the overlays are not rendered at
 * all (see styles.css).
 */
export const SHUTTER_EVENT = "onysnow:shutter";

export function fireShutter(at?: { x: number; y: number }) {
  window.dispatchEvent(new CustomEvent(SHUTTER_EVENT, { detail: at }));
}

export function ShutterFlash() {
  const flashRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const onFire = (event: Event) => {
      const at = (event as CustomEvent<{ x: number; y: number } | undefined>).detail;
      const flash = flashRef.current;
      const frame = frameRef.current;

      if (flash) {
        // The burst originates where the gesture was made rather than always
        // at the centre of the screen.
        if (at) {
          flash.style.setProperty("--flash-x", `${(at.x / window.innerWidth) * 100}%`);
          flash.style.setProperty("--flash-y", `${(at.y / window.innerHeight) * 100}%`);
        }
        restart(flash);
      }
      if (frame) restart(frame);

      // The glass reacts to the same light.
      flashPanels();
    };

    window.addEventListener(SHUTTER_EVENT, onFire);
    return () => window.removeEventListener(SHUTTER_EVENT, onFire);
  }, []);

  return (
    <>
      <div ref={flashRef} aria-hidden="true" className="shutter-flash" />
      <div ref={frameRef} aria-hidden="true" className="shutter-frame">
        <span />
        <span />
        <span />
        <span />
      </div>
    </>
  );
}

/** Re-applying a running animation is a no-op unless the browser sees a change. */
function restart(el: HTMLElement) {
  el.removeAttribute("data-firing");
  void el.offsetWidth;
  el.setAttribute("data-firing", "");
  window.setTimeout(() => el.removeAttribute("data-firing"), 1000);
}
