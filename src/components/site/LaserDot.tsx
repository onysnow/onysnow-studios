import { useEffect, useRef } from "react";
import { LASER_COLOURS, holdLaser, laserLight, type LaserColour } from "@/effects/light/lights";

/** The laser's colour from the address (?laser=green), red if none or unknown. */
function laserColourFromUrl(): LaserColour {
  if (typeof window === "undefined") return "red";
  const asked = new URLSearchParams(window.location.search).get("laser");
  return asked && asked in LASER_COLOURS ? (asked as LaserColour) : "red";
}

/**
 * A laser pointer's spot (item 24, ?try=laser): switched on while this is
 * mounted. What it does to the scene is the light list's (effects/light
 * laserLight); drawn here is the spot itself -- a burnt-white core, the
 * colour round it, and the speckle a coherent beam makes on anything it
 * strikes: a fine, fizzing grain, because the light scattered from the
 * surface's roughness interferes with itself.
 */
export function LaserDot() {
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const colour = laserColourFromUrl();
    const [r, g, b] = LASER_COLOURS[colour];
    spot.current?.style.setProperty(
      "--laser",
      `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`,
    );
    // The grain in the beam's own colour.
    spot.current
      ?.querySelector("feColorMatrix")
      ?.setAttribute("values", `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  3 0 0 0 -1.4`);
    const off = holdLaser(colour);
    let frame = 0;
    let seed = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = spot.current;
      if (!el) return;
      el.style.opacity = laserLight.charge > 0 ? "1" : "0";
      el.style.transform = `translate3d(${laserLight.x}px, ${laserLight.y}px, 0)`;
      // The speckle boils as the hand moves: a new grain every few frames.
      seed = (seed + 1) % 240;
      if (seed % 4 === 0) {
        el.querySelector("feTurbulence")?.setAttribute("seed", String(seed / 4));
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      off();
    };
  }, []);

  return (
    <div ref={spot} aria-hidden="true" className="laser-dot" style={{ opacity: 0 }}>
      <svg className="laser-dot__speckle" width="44" height="44" viewBox="0 0 44 44">
        <filter id="laser-speckle" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={1} seed={1} />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.4" />
        </filter>
        <radialGradient id="laser-speckle-fade">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="laser-speckle-mask">
          <circle cx="22" cy="22" r="22" fill="url(#laser-speckle-fade)" />
        </mask>
        <rect width="44" height="44" filter="url(#laser-speckle)" mask="url(#laser-speckle-mask)" />
      </svg>
    </div>
  );
}
