import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { addEmitter, emitterChanged, makeEmitter } from "@/effects/light/lights";

/**
 * The gases, by the colour a lit tube gives. True neon is the red-orange;
 * the rest are argon and mercury behind a phosphor coat or a tinted tube.
 */
export const NEON_GASES = {
  neon: "#ff4a1c",
  pink: "#ff3fa4",
  blue: "#3fa9ff",
  green: "#3dff7a",
  white: "#f4f0ff",
} as const;
export type NeonGas = keyof typeof NEON_GASES;

/**
 * How a tube burns.
 *
 *   steady   a healthy tube: the faint shimmer of the gas, nothing more.
 *   flicker  a loose electrode: lit, then every few seconds a stutter of
 *            quick drop-outs, now and then dark for a beat.
 *   dying    a failing transformer: dim and buzzing, dropping out often,
 *            flaring back to full for moments.
 */
export type NeonFlicker = "steady" | "flicker" | "dying";

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const c: [number, number, number] = [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
  const peak = Math.max(...c, 1e-3);
  return [c[0] / peak, c[1] / peak, c[2] / peak];
}

/** How brightly a tube burns next, 0 to 1, from how it has been burning. */
function nextLevel(
  mode: NeonFlicker,
  state: { until: number; level: number; burst: number },
  now: number,
) {
  if (mode === "steady") return 0.96 + 0.04 * Math.sin(now / 37);
  if (now < state.until) return state.level;
  if (mode === "flicker") {
    if (state.burst > 0) {
      state.burst -= 1;
      state.level = state.level > 0.5 ? 0.04 : 1;
      state.until = now + 30 + Math.random() * 90;
    } else if (Math.random() < 0.18) {
      state.burst = 3 + Math.floor(Math.random() * 6);
      state.level = 0.04;
      state.until = now + 40 + Math.random() * 60;
    } else {
      state.level = Math.random() < 0.08 ? 0.03 : 1;
      state.until =
        now + (state.level < 0.5 ? 250 + Math.random() * 300 : 1500 + Math.random() * 3500);
    }
    return state.level;
  }
  // dying
  const r = Math.random();
  state.level = r < 0.25 ? 0.03 : r < 0.9 ? 0.45 + Math.random() * 0.2 : 1;
  state.until = now + (state.level > 0.9 ? 120 + Math.random() * 400 : 25 + Math.random() * 90);
  return state.level;
}

/**
 * A neon sign (item 23): a real tube, and a light in the scene.
 *
 * Drawn as the tube is: a white-hot core where the discharge is densest, the
 * gas's saturated colour round it, and the glow that colour throws into the
 * air and onto the wall, fading over a hand's width. Unlit, the tube is still
 * there -- pale glass with the colour faintly in it -- which is what makes a
 * flickering sign read as a failing tube rather than blinking text.
 *
 * While it burns it is an emitter in the light list, at its own place on the
 * page, in its gas's colour and as bright as it is burning: the glass near it
 * catches it on its rims and smudges, and the photographs under the glass
 * are lit by it, by the same physics as the lamp.
 */
export function Neon({
  children,
  gas = "pink",
  flicker = "steady",
  className,
  lights = true,
}: {
  children: ReactNode;
  gas?: NeonGas;
  flicker?: NeonFlicker;
  className?: string;
  /** Whether it lights the scene (an emitter). A second sign nearby can leave it to the first. */
  lights?: boolean;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const hex = NEON_GASES[gas];

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let level = 1;
    let rect = node.getBoundingClientRect();
    // Mounted a little off what it hangs on; as long as a third of its lettering.
    const light = makeEmitter(`neon-${gas}`, rgbOf(hex), 36, () =>
      Math.max(12, Math.min(rect.width, 400) / 3),
    );
    const remove = lights ? addEmitter(light) : () => {};
    const state = { until: 0, level: 1, burst: 0 };
    let frame = 0;
    let lastPlaced = -1;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const next = nextLevel(flicker, state, now);
      // Re-read where it is a few times a second: it moves only as the page scrolls.
      const moved = now - lastPlaced > 120;
      if (moved) {
        rect = node.getBoundingClientRect();
        lastPlaced = now;
      }
      const onScreen = rect.bottom > -200 && rect.top < window.innerHeight + 200;
      if (Math.abs(next - level) < 0.01 && !moved) return;
      level = next;
      light.level = level;
      node.style.setProperty("--lit", level.toFixed(3));
      if (!lights) return;
      light.x = rect.left + rect.width / 2;
      light.y = rect.top + rect.height / 2;
      light.charge = onScreen ? 1 : 0;
      emitterChanged();
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      remove();
    };
  }, [gas, flicker, hex, lights]);

  return (
    <span
      ref={el}
      className={className ? `neon ${className}` : "neon"}
      data-gas={gas}
      style={{ "--neon-colour": hex } as CSSProperties}
    >
      {children}
    </span>
  );
}
