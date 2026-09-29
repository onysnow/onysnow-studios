import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Img, type ImgSource } from "@/components/site/Img";
import type { Focus } from "@/lib/page-photos";
import { cn } from "@/lib/utils";

/**
 * The whole photograph, and a crosshair on the point to keep in frame.
 *
 * Click (or tap) anywhere to move it. With the keyboard: focus the picture and
 * use the arrow keys, Shift for bigger steps. The same control the WordPress
 * Cover block, Payload and Sanity's hotspot give an editor.
 */
export function FocusPicker({
  image,
  focus,
  onChange,
  label,
}: {
  image: ImgSource;
  /** Null: never set, shown centred. */
  focus: Focus | null;
  onChange: (focus: Focus) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const at = focus ?? { x: 0.5, y: 0.5 };

  function place(e: PointerEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    onChange({
      x: round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))),
      y: round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))),
    });
  }

  function nudge(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    onChange({
      x: round(Math.min(1, Math.max(0, at.x + d[0]))),
      y: round(Math.min(1, Math.max(0, at.y + d[1]))),
    });
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={`${Math.round(at.x * 100)}% across, ${Math.round(at.y * 100)}% down`}
      aria-valuenow={Math.round(at.x * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerUp={place}
      onKeyDown={nudge}
      className="relative cursor-crosshair overflow-hidden rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Img image={image} sizes="360px" />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.6),0_2px_8px_rgba(0,0,0,.5)]",
          focus ? "" : "border-dashed opacity-70",
        )}
        style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      >
        <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </span>
    </div>
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;
