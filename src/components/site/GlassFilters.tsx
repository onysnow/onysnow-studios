import { useEffect, useRef, useSyncExternalStore } from "react";
import { t } from "@/lib/tuning";
import { bevelFilterSnapshot, subscribeBevelFilters, type BevelEntry } from "@/lib/bevel-filters";

/** Stable empty array: the server renders no computed maps. */
const EMPTY_BEVELS: BevelEntry[] = [];
/**
 * The SVG filter the glass rim refracts through.
 *
 * Referenced by `backdrop-filter: url("#glass-refraction")` on the edge strips.
 *
 * The constraint that shapes all of this: a CSS filter cannot refract. Filter
 * functions process each pixel where it already is, and refraction means
 * fetching the backdrop from SOMEWHERE ELSE. `feDisplacementMap` is the only
 * thing in the platform that can do that inside a backdrop-filter, and only
 * Chromium supports SVG filters there at all — so Safari and Firefox take the
 * plain lensing fallback in the stylesheet and always will.
 *
 * THE MAP IS COMPUTED, NOT DRAWN.
 *
 * In a displacement map the red channel carries the X component of the
 * displacement vector and green carries Y, encoded as 128 + component * 127,
 * so 128 means "leave this pixel alone". The vector is the surface NORMAL of
 * the glass, and the normal comes from a thickness profile — not from a
 * gradient someone thought looked about right, which is what this used to be
 * and why it read as a smear rather than as a lens.
 *
 * Green only. The bands run the full width of the page, so their left and
 * right sides are never in view — there is no vertical arris to bend around,
 * and putting a horizontal edge profile in the red channel would draw a bevel
 * where the eye can plainly see there is not one. Sideways movement still
 * happens, from the waviness below, which is the glass being uneven rather
 * than the glass having an edge there.
 *
 * The body of the map is deliberately NOT neutral: a pane distorts what is
 * behind it everywhere, most violently at the bevel.
 *
 * The profile is the convex squircle
 *
 *     y = (1 - (1 - x)^4)^(1/4)
 *
 * where x is normalised depth in from the edge, differentiated numerically
 * (delta 0.001) to get the slope at each row. The slope runs away to infinity
 * at the very edge, so it is clamped and normalised. Both halves bend toward
 * the middle of the pane, which is what a real bevel does to what is behind
 * it.
 *
 * Method from kube.io's "Liquid Glass in the Browser" and the screen-space
 * refraction write-up at zenn.dev/orectic, which independently arrives at the
 * same shape: normal from the gradient of a distance field, magnitude on a
 * falloff that is strong at the edge and zero in the middle.
 */
const DISPLACEMENT_MAP =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAACACAIAAAC5jr9pAAAAWUlEQVR42u3XuwkAIAxF0SgO7lrOZG8h/hbwCQExFi/tIalvXJyynSAJQUZQEFQEDUFXw0Aw7cCL3Np4cYpAIBAIBALhezDNKNOyPPSuPp2butuL+jcA38QCkx8fvd8YKf8AAAAASUVORK5CYII=";

/**
 * Peak displacement, in pixels.
 *
 * `feDisplacementMap`'s scale converts the map's normalised [-1, 1] back into
 * real pixels, so this is literally how far the outermost row of the bevel
 * drags the backdrop. Matched to the strip height: bending it further than the
 * bevel is deep would pull in content from outside the glass.
 */
const MAX_DISPLACEMENT = 40;

/**
 * One refraction filter. The only thing that differs between panes is the map.
 *
 * Everything below -- the waviness, the three-scale dispersion, the recombine
 * -- is identical for every geometry, so it is written once here and emitted
 * per map rather than duplicated per pane.
 */
function RefractionFilter({ id, href }: { id: string; href: string }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
      {/* The lens profile: neutral through the middle, bending at the rim. */}
      <feImage href={href} preserveAspectRatio="none" result="lens" />

      {/* Imperfection, at low amplitude — a flawless edge looks synthetic. */}
      {/*
            Waviness, and it is not decoration.
 
            Float glass is not optically flat. It is poured, and it cools with
            a slow undulation across its surface that you see every day without
            naming it — the reason a reflection in a shop window wobbles as you
            walk past, and why what is behind a large pane is never quite
            where it should be. A very low frequency is the whole point: fine
            noise is frosted glass, broad noise is a real window.
 
            This is what gives the BODY of the pane its distortion. The map
            underneath it handles the edges.
          */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.004 0.009"
        numOctaves={2}
        seed={9}
        result="flaw"
      />
      <feComposite
        in="flaw"
        in2="lens"
        operator="arithmetic"
        k1="0"
        k2="0.16"
        k3="0.84"
        k4="0"
        result="profile"
      />

      {/*
            Three displacements, not one — the channels are bent by slightly
            different amounts rather than bent together and then shoved apart.

            The previous version displaced once and split the result with a
            flat `feOffset` of ±2.2px. That is not dispersion: a uniform shift
            applies just as hard through the middle of the pane as at its
            edge, so every photograph behind every panel wore a red/cyan
            double exposure across its whole face. Real aberration is zero
            where the glass is flat and grows with the bending, which is
            exactly what falls out of scaling the same map per channel.
          */}
      <feDisplacementMap
        in="SourceGraphic"
        in2="profile"
        scale={MAX_DISPLACEMENT * 0.94}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bentR"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="profile"
        scale={MAX_DISPLACEMENT}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bentG"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="profile"
        scale={MAX_DISPLACEMENT * 1.07}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bentB"
      />

      {/* Recombined: red from the least-bent pass, blue from the most. */}
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
      <feBlend in="rg" in2="onlyB" mode="screen" result="dispersed" />

      <feColorMatrix in="dispersed" type="saturate" values="1.12" />
    </filter>
  );
}

export function GlassFilters() {
  /*
   * The computed maps, one per pane geometry on the page. `useSyncExternalStore`
   * because panes register as they mount and as they resize, from outside
   * React -- the alternative is a context every `Glass` has to thread through.
   */
  const bevels = useSyncExternalStore(
    subscribeBevelFilters,
    bevelFilterSnapshot,
    () => EMPTY_BEVELS,
  );
  /*
   * The displacement scale is an SVG attribute, not a CSS property, so the
   * panel cannot reach it with a custom property. Written directly instead,
   * and only when it actually differs -- setting an attribute every frame
   * invalidates the filter and re-rasterises every pane behind it.
   */
  const host = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let frame = 0;
    let last = -1;
    /*
     * Queried rather than held in refs.
     *
     * There is no longer one filter: there is one per pane geometry, created
     * as panes mount and resize, so a fixed array of three refs cannot reach
     * them. The scale within each filter still runs 0.94 / 1.00 / 1.07 -- the
     * same map read three times at slightly different strengths, which is what
     * makes the dispersion follow the surface normal instead of a fixed axis.
     */
    const mult = [0.94, 1, 1.07];
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const want = t("displacement");
      if (want === last) return;
      last = want;
      const nodes = host.current?.querySelectorAll("feDisplacementMap");
      nodes?.forEach((node, i) => node.setAttribute("scale", String(want * (mult[i % 3] ?? 1))));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      ref={host}
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <RefractionFilter id="glass-refraction" href={DISPLACEMENT_MAP} />
        {bevels.map((b) => (
          <RefractionFilter key={b.id} id={b.id} href={b.href} />
        ))}
      </defs>
    </svg>
  );
}
