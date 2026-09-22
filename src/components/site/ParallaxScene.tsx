import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Img, type ImgSource } from "./Img";
import { cn } from "@/lib/utils";

const DEPTH = { subtle: 0.04, standard: 0.08, deep: 0.14 } as const;

const SCRIM = {
  none: "",
  bottom: "bg-gradient-to-t from-background via-background/40 to-transparent",
  full: "bg-background/55",
} as const;

/**
 * A full-bleed photograph that scrolls slower than the content laid over it,
 * which is what produces the sense of depth.
 *
 * Transform-only — never layout properties — so it stays on the compositor.
 * Parallax is switched off under `prefers-reduced-motion` and on small screens,
 * where the effect tends to stutter and costs more than it gives.
 */
export function ParallaxScene({
  image,
  children,
  depth = "standard",
  scrim = "bottom",
  height = "min-h-[80svh]",
  className,
}: {
  image: ImgSource | null | undefined;
  children?: ReactNode;
  depth?: keyof typeof DEPTH;
  scrim?: keyof typeof SCRIM;
  height?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const shift = DEPTH[depth] * 100;
  const y = useTransform(scrollYProgress, [0, 1], [`-${shift}%`, `${shift}%`]);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", height, className)}>
      <motion.div
        className="absolute inset-0 max-md:!translate-y-0"
        {...(reduced ? {} : { style: { y } })}
        {...(children ? {} : { "aria-hidden": true })}
      >
        {/* Oversized so the translation never reveals an edge. */}
        <Img image={image} className="h-[128%] w-full" sizes="100vw" imgClassName="object-cover" />
      </motion.div>
      {scrim === "none" ? null : <div className={cn("absolute inset-0", SCRIM[scrim])} />}
      <div className="image-vignette pointer-events-none absolute inset-0" />
      {children ? (
        <div className="relative flex h-full flex-col justify-end">{children}</div>
      ) : null}
    </div>
  );
}
