import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARRIS_RADIUS,
  arrisGlint,
  arrisLine,
  echoProfile,
  farArrisGradientCss,
  farArrisLoss,
  mirrorReach,
  PANE_THICKNESS,
  sideCosine,
  sideGradientCss,
  sideHeight,
  sideOpen,
  sidePath,
  sideTransmittance,
} from "./edge-side";
import { EDGE_SIDE_GLSL } from "./edge-side.glsl";
import { fresnelSchlick } from "./reflection";
import { GLASS_THICKNESS } from "@/lib/bevel-filters";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { tuning } from "@/lib/tuning";

/**
 * Optics plan step 8: the edge rebuilt from the reference photographs. See
 * edge-side.ts for what the photos show and what each function models.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const css = read("../../styles.css");

describe("the side face's window", () => {
  it("is green: soda-lime lets green through most, red least", () => {
    const [r, g, b] = sideTransmittance(4);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(r);
  });

  it("is most saturated at the near arris, where the light was guided furthest", () => {
    expect(sidePath(0)).toBeGreaterThan(sidePath(3));
    expect(sidePath(3)).toBeGreaterThan(sidePath(12));
    const near = sideTransmittance(2.5);
    const mid = sideTransmittance(10);
    expect(near[0] / near[1]).toBeLessThan(mid[0] / mid[1]);
  });

  it("starts after the eased corner, which reflects rather than looks through", () => {
    expect(sideTransmittance(0)).toEqual([1, 1, 1]);
    expect(sideTransmittance(3)[0]).toBeLessThan(0.6);
  });

  it("has a soft darker line at the far arris, not a bright one", () => {
    expect(farArrisLoss(0)).toBeGreaterThan(0.3);
    expect(farArrisLoss(ARRIS_RADIUS)).toBeLessThan(farArrisLoss(0));
    expect(farArrisLoss(3 * ARRIS_RADIUS)).toBeLessThan(0.01);
  });

  it("is built into the CSS from the same numbers", () => {
    const top = sideGradientCss("to bottom");
    const [r, g, b] = sideTransmittance(0).map((t) => Math.round(255 * Math.pow(t, 1 / 2.2)));
    expect(top).toContain(`rgb(${r} ${g} ${b}) 0px`);
    expect(top.startsWith("linear-gradient(to bottom,")).toBe(true);
    // Darkest in the middle of the far-arris layer, where the corner is.
    const stops = [...farArrisGradientCss("to top").matchAll(/rgb\((\d+) /g)].map((m) => +m[1]!);
    expect(Math.min(...stops)).toBe(stops[4]);
  });

  it("is a multiply layer beside the pane, not a painted stripe inside it", () => {
    expect(css).toMatch(/\.glass-side \{[^}]*mix-blend-mode: multiply/);
    expect(css).not.toContain(".glass > .glass__side");
    // The old painted teal stripes and hard echo line are gone.
    expect(css).not.toContain("oklch(0.95 0.06 168 / 0.72)");
    expect(css).not.toContain("--echo: 5px");
  });
});

describe("the side's height", () => {
  it("has one definition: no second copy in the stylesheet to drift", () => {
    expect(css).not.toContain("--side-top");
    expect(css).not.toContain("--pane-top");
    // Bars are thinner glass than bands.
    expect(sideHeight(1, true)).toBeLessThan(sideHeight(1));
  });

  it("opens on the side facing the eye and never closes on the other", () => {
    expect(sideOpen(1, true)).toBe(1);
    expect(sideOpen(1, false)).toBeGreaterThan(0);
    expect(sideOpen(-1, false)).toBe(1);
  });

  it("the thinner it shows, the more grazing the look and the more it mirrors", () => {
    const thin = fresnelSchlick(sideCosine(3, PANE_THICKNESS), 1.518);
    const open = fresnelSchlick(sideCosine(16, PANE_THICKNESS), 1.518);
    expect(thin).toBeGreaterThan(open);
    expect(thin).toBeLessThan(1);
  });

  it("is the same thickness the CSS bend is built from", () => {
    expect(GLASS_THICKNESS).toBe(PANE_THICKNESS);
  });
});

describe("the side as a mirror", () => {
  it("reflects the photograph beyond the edge, flipped: the near arris shows the furthest", () => {
    const near = mirrorReach(0, 10, 70, PANE_THICKNESS);
    const far = mirrorReach(10, 10, 70, PANE_THICKNESS);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeCloseTo(10 * (1 + 70 / PANE_THICKNESS));
  });

  it("with no gap, reflects only what is right at the edge", () => {
    expect(mirrorReach(0, 10, 0, PANE_THICKNESS)).toBe(10);
  });
});

describe("the arris", () => {
  // A top edge along y = 0, outward normal pointing up the page.
  const g: [number, number] = [0, -1];
  const eye: [number, number, number] = [640, 400, 1536];
  const power = 756_000;
  const glint = (x: number, lamp: [number, number, number], size = 46) =>
    arrisGlint([x, 0], g[0], g[1], lamp, size, eye, 0.02, power, 1.518);

  it("glints beside the lamp and nowhere else along the edge: short segments", () => {
    const lamp: [number, number, number] = [300, -80, 230];
    const xs = Array.from({ length: 121 }, (_, i) => i * 10);
    const values = xs.map((x) => glint(x, lamp));
    const peakAt = xs[values.indexOf(Math.max(...values))]!;
    expect(Math.abs(peakAt - 300)).toBeLessThan(80);
    expect(glint(1100, lamp)).toBeLessThan(0.02 * Math.max(...values));
  });

  it("a bigger lamp throws a longer glint", () => {
    const lamp: [number, number, number] = [300, -80, 230];
    const halfLength = (size: number) => {
      const peak = glint(300, lamp, size);
      let x = 300;
      while (glint(x, lamp, size) > peak / 2 && x < 1300) x += 2;
      return x - 300;
    };
    expect(halfLength(90)).toBeGreaterThan(halfLength(20));
  });

  it("is lit only by a lamp on its side of the edge", () => {
    expect(glint(300, [300, -80, 230])).toBeGreaterThan(0);
    // Far below the top edge, the lamp's mirror direction falls outside the corner's arc.
    expect(glint(300, [300, 900, 5])).toBe(0);
  });

  it("integrates the lobe across the arc: wider roughness, lower and broader", () => {
    expect(arrisLine(0, 0.02)).toBeGreaterThan(arrisLine(0, 0.2));
    expect(arrisLine(0.1, 0.2)).toBeGreaterThan(arrisLine(0.1, 0.02));
  });

  it("the echo sits one more side's height in, soft", () => {
    expect(echoProfile(20, 10)).toBe(1);
    expect(echoProfile(20 + 3 * ARRIS_RADIUS, 10)).toBeLessThan(0.001);
  });
});

describe("the edge is causes, not results", () => {
  it("has no edge-glow or side-reach setting", () => {
    expect(tuning["arris"]).toBeUndefined();
    expect(tuning["sideReach"]).toBeUndefined();
  });

  it("the glass shader draws the edge from the shared chunk", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    expect(src.split(EDGE_SIDE_GLSL).length - 1).toBe(1);
    expect(src).not.toContain("uArris");
    expect(src).not.toContain("uSideReach");
    expect(src).toContain("arrisGlint(onEdge, grad, lamp, uLightSize, eye");
  });

  it("draws no hairline round the pane", () => {
    expect(css).not.toContain("oklch(0.97 0.03 170 / 0.5) 0%");
    expect(css).not.toMatch(/inset 0 1px 0 oklch\(1 0 0 \/ 0\.1\)/);
  });
});
