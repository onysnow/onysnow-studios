import { useEffect, useRef } from "react";
import { flareBrightness, flareLight, lightFlare } from "@/effects/light/lights";

/**
 * The road flare you hold (item 22, ?try=flare): lit for as long as this is
 * mounted. What it does to the scene is the light list's (effects/light
 * flareLight); what is drawn here is the flame itself -- a white-hot core
 * inside a red bloom, breathing with the flicker, where the flare is.
 */
export function FlareTorch() {
  const flame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const putOut = lightFlare();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = flame.current;
      if (!el) return;
      const b = flareBrightness();
      el.style.opacity = b > 0 ? "1" : "0";
      el.style.transform = `translate3d(${flareLight.x}px, ${flareLight.y}px, 0)`;
      el.style.setProperty("--flare", b.toFixed(3));
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      putOut();
    };
  }, []);

  return <div ref={flame} aria-hidden="true" className="flare-torch" style={{ opacity: 0 }} />;
}
