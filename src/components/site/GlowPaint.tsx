import { useEffect, useRef } from "react";
import { cursorLamp, flashLight, onFlash } from "@/effects/light/lights";
import {
  PHOSPHOR_GLOW,
  decay,
  excite,
  glowOf,
  type PhosphorCell,
} from "@/effects/materials/phosphor";

/** Cells per CSS pixel: the glow is soft, a coarse field drawn smooth is enough. */
const CELL = 4;
/** The brush a drag paints light in with, CSS px. */
const BRUSH = 14;

/**
 * A board painted with glow-in-the-dark paint (item 25). Draw on it and the
 * line glows; so does wherever the lamp shines on it, and the whole board
 * when the shutter flash fires. Then it fades the way the paint does
 * (effects/materials/phosphor): a hard drop in the first seconds, then a
 * mid glow that sinks slowly to nothing.
 *
 * The field is a coarse grid of cells, each with its two stores of light,
 * drawn up smooth and added to what is behind. The loop sleeps when the
 * board is dark and nothing is lighting it.
 */
export function GlowPaint({ className }: { className?: string }) {
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = board.current;
    const view = canvas.current;
    if (!host || !view) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    let cols = 1;
    let rows = 1;
    let cells: PhosphorCell[] = [];
    let image = ctx.createImageData(1, 1);
    const size = () => {
      const r = host.getBoundingClientRect();
      cols = Math.max(1, Math.ceil(r.width / CELL));
      rows = Math.max(1, Math.ceil(r.height / CELL));
      cells = Array.from({ length: cols * rows }, () => ({ fast: 0, slow: 0 }));
      view.width = cols;
      view.height = rows;
      image = ctx.createImageData(cols, rows);
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(host);

    /** Light a disc of the board, in CSS px from its corner. */
    const stamp = (x: number, y: number, radius: number, amount: number) => {
      const cx = x / CELL;
      const cy = y / CELL;
      const r = radius / CELL;
      for (let j = Math.max(0, Math.floor(cy - r)); j < Math.min(rows, Math.ceil(cy + r)); j++) {
        for (let i = Math.max(0, Math.floor(cx - r)); i < Math.min(cols, Math.ceil(cx + r)); i++) {
          const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / r;
          if (d < 1) excite(cells[j * cols + i]!, amount * (1 - d * d));
        }
      }
    };

    let frame = 0;
    let last = performance.now();
    let drawing = false;
    let prev: { x: number; y: number } | null = null;
    const draw = (now: number) => {
      frame = 0;
      // Real time, so the paint fades at its own rate however slow the frames
      // are (capped at a second: a tab put away does not fade in one step).
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      const rect = host.getBoundingClientRect();
      // The lamp charges what it shines on, while it burns.
      if (cursorLamp.charge > 0.05) {
        stamp(cursorLamp.x - rect.left, cursorLamp.y - rect.top, 70, cursorLamp.charge * dt * 0.35);
      }
      let lit = 0;
      const data = image.data;
      for (let k = 0; k < cells.length; k++) {
        const cell = cells[k]!;
        decay(cell, dt);
        const g = glowOf(cell);
        lit = Math.max(lit, g);
        const o = k * 4;
        data[o] = PHOSPHOR_GLOW[0] * 255;
        data[o + 1] = PHOSPHOR_GLOW[1] * 255;
        data[o + 2] = PHOSPHOR_GLOW[2] * 255;
        data[o + 3] = g * 255;
      }
      ctx.putImageData(image, 0, 0);
      // Asleep once it is dark and nothing is lighting it.
      if (lit > 0.004 || drawing || cursorLamp.charge > 0.05) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };

    const at = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      prev = at(e);
      stamp(prev.x, prev.y, BRUSH, 1);
      wake();
    };
    const move = (e: PointerEvent) => {
      if (!drawing || !prev) {
        // Hovering with the lamp lit still charges it.
        if (cursorLamp.charge > 0.05) wake();
        return;
      }
      const p = at(e);
      // A continuous line, however fast the pointer moves.
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / (BRUSH / 3)));
      for (let s = 1; s <= steps; s++) {
        stamp(
          prev.x + ((p.x - prev.x) * s) / steps,
          prev.y + ((p.y - prev.y) * s) / steps,
          BRUSH,
          0.5,
        );
      }
      prev = p;
      wake();
    };
    const up = () => {
      drawing = false;
      prev = null;
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // The flash charges the whole board at once.
    const stopFlash = onFlash(() => {
      if (flashLight.charge < 0.5) return;
      for (const cell of cells) excite(cell, 0.06);
      wake();
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stopFlash();
    };
  }, []);

  return (
    <div
      ref={board}
      className={className ? `glow-paint ${className}` : "glow-paint"}
      data-glow-paint
    >
      <canvas ref={canvas} aria-hidden="true" className="glow-paint__light" />
      <span className="glow-paint__hint">
        Draw here. Or shine the lamp on it, or fire the flash.
      </span>
    </div>
  );
}
