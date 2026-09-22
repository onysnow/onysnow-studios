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
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAACACAIAAAC5jr9pAAAAbklEQVR42u3XQQrAIAwEwK304f7ST3gtpJWqH+geAsUQidchES9mc+SR8XVO3CBQGFQGFwNh8DBoDN7/oDMYlhVaSIBdK9MKZ62cXR7vCAjYBuIv2XawOJvnK1oZZ7i+IL02daYWdW6v6t2AbBMT1tI4bSJg5KIAAAAASUVORK5CYII=";

/**
 * Peak displacement, in pixels.
 *
 * `feDisplacementMap`'s scale converts the map's normalised [-1, 1] back into
 * real pixels, so this is literally how far the outermost row of the bevel
 * drags the backdrop. Matched to the strip height: bending it further than the
 * bevel is deep would pull in content from outside the glass.
 */
const MAX_DISPLACEMENT = 22;

export function GlassFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <filter
          id="glass-refraction"
          colorInterpolationFilters="sRGB"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          {/* The lens profile: neutral through the middle, bending at the rim. */}
          <feImage href={DISPLACEMENT_MAP} preserveAspectRatio="none" result="lens" />

          {/* Imperfection, at low amplitude — a flawless edge looks synthetic. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.06"
            numOctaves={1}
            seed={9}
            result="flaw"
          />
          <feComposite
            in="flaw"
            in2="lens"
            operator="arithmetic"
            k1="0"
            k2="0.12"
            k3="0.88"
            k4="0"
            result="profile"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="profile"
            scale={MAX_DISPLACEMENT}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bent"
          />

          {/*
            Chromatic dispersion. Glass separates wavelengths by slightly
            different amounts, so a real edge fringes into colour — the
            strongest single cue that something is glass and not a blur.
            Done by nudging the channels of the already-bent result apart,
            which is visually close to sampling three times and costs a
            fraction of it.
          */}
          <feColorMatrix
            in="bent"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />
          <feOffset in="red" dx="2.2" dy="0.7" result="redShift" />
          <feColorMatrix
            in="bent"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="cyan"
          />
          <feOffset in="cyan" dx="-2.2" dy="-0.7" result="cyanShift" />
          <feBlend in="redShift" in2="cyanShift" mode="screen" result="dispersed" />

          {/* Glass edges carry more contrast than the scene behind them. */}
          <feColorMatrix in="dispersed" type="saturate" values="1.35" />
        </filter>
      </defs>
    </svg>
  );
}
