/**
 * The SVG filter the glass rim refracts through.
 *
 * Referenced by `backdrop-filter: url("#glass-refraction")` on the edge strips.
 *
 * The displacement map is a GRADIENT, not turbulence, and that choice is the
 * difference between glass and bathroom glass. In a displacement map the
 * channels are read in [0,255] with 128 meaning "do not move this pixel";
 * above pushes one way, below the other. So a vertical ramp — push down at the
 * top of the strip, neutral through the middle, push up at the bottom — bends
 * the backdrop inward at the rim the way the curved edge of a real pane does.
 * Turbulence instead displaces everything randomly, which reads as textured or
 * frosted glass rather than as a smooth edge.
 *
 * A little turbulence is layered in at low amplitude for imperfection, because
 * a perfectly uniform edge looks synthetic.
 */
const DISPLACEMENT_MAP =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='32'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>` +
      `<stop offset='0' stop-color='rgb(128,255,128)'/>` +
      `<stop offset='0.22' stop-color='rgb(128,206,128)'/>` +
      `<stop offset='0.48' stop-color='rgb(128,128,128)'/>` +
      `<stop offset='0.52' stop-color='rgb(128,128,128)'/>` +
      `<stop offset='0.78' stop-color='rgb(128,50,128)'/>` +
      `<stop offset='1' stop-color='rgb(128,0,128)'/>` +
      `</linearGradient></defs>` +
      `<rect width='8' height='32' fill='url(%23g)'/>` +
      `</svg>`,
  );

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
            scale="54"
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
