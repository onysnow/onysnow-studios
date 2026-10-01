import { useEffect, useState } from "react";

import { pointer } from "@/effects/light/lights";
import { onTuningApplied, t } from "@/lib/tuning";

/**
 * The page under a black light (docs/black-light.md; Ony, 2026-10-01: "The
 * blacklight effect is terrible. Did you even look up references to what
 * blacklights do and what things look like under black light").
 *
 * Held, the black light turns the room off -- a black light is used in the
 * dark, and fluorescence is too faint to see in a lit room -- and lights the
 * page with UV round the hand, out to its reach:
 *
 *   the photographs glow as OBA prints do: their own luminance as
 *     brightener blue, the paper's whites most, the ink-dense darks not at
 *     all (an SVG colour matrix and curve, #uv-paper);
 *   what does not fluoresce is seen only by the lamp's violet leak, dark;
 *   light type glows blue-white, as white ink with brighteners;
 *   the day-glo orange buttons blaze;
 *   the lamp's own visible light: a faint violet (365 nm) or a purple wash
 *     (395 nm LED).
 */

/** The lamp's visible leak, per type: its colour and how much of it there is. */
const LEAK = [
  { rgb: [0.42, 0.2, 1.0], amount: 0.07, reflect: 0.45 }, // 365 nm, filtered: "a dim violet glow"
  { rgb: [0.36, 0.2, 1.0], amount: 0.22, reflect: 1.35 }, // 395 nm LED: "strong purple glow", the references' look
] as const;

/** What the lamp's light shows of a surface that does not fluoresce: deep indigo (the references' walls and skin). */
const INDIGO = [0.14, 0.08, 1.0] as const;
/** Brightener blue-white: what an optical brightener re-emits (peaking near 440 nm). */
const OBA = [0.62, 0.78, 1.0] as const;
/** The neon colours fluorescent pigments blaze in (the references: lips, paint, acrylic). */
const HOT_PINK = [1.0, 0.16, 0.5] as const;
const NEON_GREEN = [0.45, 1.0, 0.18] as const;
const ELECTRIC_BLUE = [0.15, 0.75, 1.0] as const;

const f = (n: number) => Number(n.toFixed(4));
const LUM = [0.2126, 0.7152, 0.0722] as const;

/** A colour matrix: `colour` times (luminance + offset), each channel clamped at 0 by the filter. */
function lumRow(colour: readonly number[], offset: number): string {
  return termRow(colour, LUM, offset);
}

/** A colour matrix: `colour` times (the weights' sum of r, g, b, plus offset). */
function termRow(colour: readonly number[], weights: readonly number[], offset: number): string {
  const rows = colour.map(
    (c) => `${f(c * weights[0]!)} ${f(c * weights[1]!)} ${f(c * weights[2]!)} 0 ${f(c * offset)}`,
  );
  return `${rows.join("  ")}  0 0 0 1 0`;
}

type Settings = {
  type: number;
  paper: number;
  neon: number;
  ink: number;
  dayglo: number;
  dark: number;
  reach: number;
};

const read = (): Settings => ({
  type: Math.round(t("uvType")),
  paper: t("uvPaper"),
  neon: t("uvNeon"),
  ink: t("uvInk"),
  dayglo: t("uvDayglo"),
  dark: t("uvRoomDark"),
  reach: t("uvReach"),
});

export function BlackLightScene() {
  const [s, setS] = useState<Settings>(read);

  useEffect(() => onTuningApplied(() => setS(read())), []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-uv", "");
    let frame = 0;
    const place = () => {
      frame = 0;
      const el = root;
      const away = pointer.x <= -9999;
      // Off the page, the UV is nowhere: the whole room is dark.
      el.style.setProperty("--uv-x", away ? "-2000px" : `${pointer.x}px`);
      el.style.setProperty("--uv-y", away ? "-2000px" : `${pointer.y}px`);
    };
    const move = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", move);
    place();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", move);
      root.removeAttribute("data-uv");
      for (const v of ["--uv-ink", "--uv-dayglo", "--uv-x", "--uv-y"]) root.style.removeProperty(v);
    };
  }, []);

  // The knobs the stylesheet reads.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--uv-ink", s.ink.toFixed(3));
    root.style.setProperty("--uv-dayglo", s.dayglo.toFixed(3));
  }, [s.ink, s.dayglo]);

  const leak = LEAK[s.type === 1 ? 1 : 0];
  const violet = `rgb(${leak.rgb.map((c) => Math.round(c * 255)).join(" ")}`;
  // The lamp's light reflected: deep indigo by luminance, stronger for the 395 nm wash.
  const base = INDIGO.map((c) => c * leak.reflect);
  // Whites: luminance past about two thirds of white, brightener blue-white.
  const w = OBA.map((c) => c * 2.4 * s.paper);
  // The neon terms, by "UV: colours in the photographs".
  const pk = HOT_PINK.map((c) => c * 3.2 * s.neon);
  const gr = NEON_GREEN.map((c) => c * 1.8 * s.neon);
  const cy = ELECTRIC_BLUE.map((c) => c * 1.6 * s.neon);
  const halo = (0.9 * s.neon).toFixed(3);

  return (
    <>
      {/*
        The photographs as OBA prints: luminance, curved so ink-dense areas
        fall dark, times brightener blue; plus the violet leak they reflect.
      */}
      {/*
        The photographs under the black light, read off Ony's references
        (2026-10-01): what does not fluoresce is seen only by the lamp's
        strong blue-violet -- deep indigo, its shading kept; whites glow
        blue-white; warm saturated colours blaze hot pink and orange,
        yellows and greens neon green, cyans electric blue; each glow with
        a halo. Every term is a colour matrix, whose output the filter
        clamps at 0 -- which is what makes "how much redder than it is
        anything else" a term at all -- and they add.
      */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id="uv-paper"
          colorInterpolationFilters="sRGB"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
        >
          {/* The lamp's own light, reflected: luminance in deep indigo. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values={lumRow(base, 0)} result="leak" />
          {/* Whites and highlights: optical brighteners, blue-white. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={lumRow(w, -0.58)}
            result="white"
          />
          {/* Warm (red, pink, orange): how much redder than the rest, hot pink-red. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(pk, [1, -0.7, -0.3], -0.36)}
            result="warm"
          />
          {/* Yellow and green: greener than blue, neon green. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(gr, [0.15, 1, -1.15], -0.05)}
            result="green"
          />
          {/* Cyan and blue: bluer-greener than red, electric blue. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(cy, [-1.2, 0.6, 0.6], 0)}
            result="cyan"
          />
          <feComposite
            in="white"
            in2="warm"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="g1"
          />
          <feComposite
            in="g1"
            in2="green"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="g2"
          />
          <feComposite
            in="g2"
            in2="cyan"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="glows"
          />
          {/* The halo round every glow. */}
          <feGaussianBlur in="glows" stdDeviation="7" result="halo" />
          <feComposite
            in="glows"
            in2="halo"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3={halo}
            k4="0"
            result="lit"
          />
          <feComposite in="lit" in2="leak" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </svg>
      {/* The room, off: dark but for the UV's reach round the hand. */}
      <div
        aria-hidden="true"
        className="blacklight-room"
        style={
          {
            "--uv-dark": s.dark.toFixed(3),
            "--uv-reach": `${s.reach}px`,
          } as React.CSSProperties
        }
      />
      {/* The lamp's own visible light: faint violet, or the 395 nm purple wash. */}
      <div
        aria-hidden="true"
        className="blacklight-leak"
        style={
          {
            "--uv-leak": `${violet} / ${(leak.amount * 1.6).toFixed(3)})`,
            "--uv-reach": `${s.reach}px`,
          } as React.CSSProperties
        }
      />
    </>
  );
}
