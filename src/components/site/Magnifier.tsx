import { useEffect, useMemo, useRef } from "react";
import { MAP_SCALE, magnifierMap } from "@/effects/optics/magnifier";
import { onLightChange, pointer } from "@/effects/light/lights";

/** The lens's radius, CSS px: a big reading glass held near the page. */
const LENS_RADIUS = 96;
/** The texture the displacement is read from. The lens is smooth; 256 is plenty. */
const MAP_SIZE = 256;

/**
 * The magnifying glass (item 21, ?try=magnifier), held where the lamp is.
 *
 * The lens is a backdrop-filter: the real page behind it, live -- photographs,
 * glass, light and all -- pulled through a displacement map that is the
 * lens's own mapping (effects/optics/magnifier): enlarged in the middle,
 * swimming outward toward the rim, and read three times at slightly different
 * strengths so the colours come apart where the lens bends most, as a simple
 * lens's do. Over it, what the glass reflects: a soft window of the room on
 * its face and a bright line round the inside of the rim. Round it, a brass
 * rim and a turned handle.
 *
 * Chromium only (SVG filters in backdrop-filter); elsewhere the lens shows
 * the page unmagnified, which is a clear disc in a brass rim -- still a glass.
 */
export function Magnifier() {
  const holder = useRef<HTMLDivElement>(null);

  // The lens's map, drawn once, as an image the filter can load.
  const href = useMemo(() => {
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    image.data.set(magnifierMap(MAP_SIZE));
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }, []);

  // Follow the lamp: moved only when the lights move, not every frame.
  useEffect(() => {
    let frame = 0;
    const place = () => {
      frame = 0;
      const el = holder.current;
      if (!el) return;
      const off = pointer.x <= -9999;
      el.style.opacity = off ? "0" : "1";
      if (!off) {
        el.style.transform = `translate3d(${pointer.x - LENS_RADIUS}px, ${pointer.y - LENS_RADIUS}px, 0)`;
      }
    };
    const stop = onLightChange(() => {
      if (!frame) frame = requestAnimationFrame(place);
    });
    place();
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  }, []);

  const scale = MAP_SCALE * LENS_RADIUS;
  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id="magnifier-lens"
          colorInterpolationFilters="sRGB"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feImage href={href} preserveAspectRatio="none" result="lens" />
          {/* Red bent least, blue most: the colours part where the lens bends hardest. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale * 0.97}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale * 1.04}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentB"
          />
          <feColorMatrix
            in="bentR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyR"
          />
          <feColorMatrix
            in="bentG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyG"
          />
          <feColorMatrix
            in="bentB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="onlyB"
          />
          <feBlend in="onlyR" in2="onlyG" mode="screen" result="rg" />
          <feBlend in="rg" in2="onlyB" mode="screen" />
        </filter>
      </svg>
      <div
        ref={holder}
        aria-hidden="true"
        className="magnifier"
        style={{ width: LENS_RADIUS * 2, height: LENS_RADIUS * 2, opacity: 0 }}
      >
        <div className="magnifier__handle" />
        <div className="magnifier__shadow" />
        <div className="magnifier__lens" />
        <div className="magnifier__rim" />
      </div>
    </>
  );
}
