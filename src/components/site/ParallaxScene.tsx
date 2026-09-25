import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Img, type ImgSource } from "./Img";
import { cn } from "@/lib/utils";

/**
 * Room for a glass band to sit over this photograph's edge.
 *
 * A seam band (see PhotoSection) floats across the join between the photograph
 * above it and the one below, and what shows through the glass is THOSE
 * photographs carrying on underneath -- not a third picture. So this box grows
 * by exactly the part of the band that overlaps it, and the band pulls itself
 * in by the same amount: the image really is behind the glass, and nothing on
 * the page moves.
 *
 * content-box, because the height comes from a min-height. Under border-box
 * the padding is counted INSIDE the min-height and an empty photograph never
 * grows at all.
 */
export const SEAM_ROOM = {
  boxSizing: "content-box",
  paddingTop: "var(--seam-above, 0px)",
  paddingBottom: "var(--seam-below, 0px)",
} as const;

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
    /*
     * `data-photo` marks this as a photographic surface for the cursor.
     * The scrim and vignette are siblings of the image and cover it edge to
     * edge, so a hit test from the pointer lands on a plain div and finds no
     * `img` above it. The marker is on the container they all share.
     */
    <div ref={ref} data-photo className={cn("relative", height, className)} style={SEAM_ROOM}>
      {/*
       * The clip wraps the PICTURE, not the section.
       *
       * It used to be on the container. It has to exist -- the parallax image
       * is 128% tall and slides, so without a clip the oversized photograph
       * spills out of the section -- but on the container it also cropped
       * everything else, and the thing it cropped that matters is the glass.
       *
       * The pane's light layer sits at `inset: -90px` precisely so a lit edge
       * can throw light OUT of the glass; that spill above the top edge is
       * most of what says the edge is bright rather than merely pale. The
       * container's clip cut it off dead at the boundary, which reads as a
       * hard line where the softest part of the glow should be.
       *
       * Same fix as the photo anchor further up: move the clip in to the only
       * thing that needs it, and let everything resting on the section escape.
       * `rounded-[inherit]` so a section given a corner radius still rounds
       * its picture.
       */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <motion.div
          className="absolute inset-0 max-md:!translate-y-0"
          {...(reduced ? {} : { style: { y } })}
          {...(children ? {} : { "aria-hidden": true })}
        >
          {/* Oversized so the translation never reveals an edge. */}
          <Img
            image={image}
            className="h-[128%] w-full"
            sizes="100vw"
            imgClassName="object-cover"
          />
        </motion.div>
        {scrim === "none" ? null : <div className={cn("absolute inset-0", SCRIM[scrim])} />}
        <div className="image-vignette pointer-events-none absolute inset-0" />
      </div>
      {children ? (
        <div className="relative flex h-full flex-col justify-end">{children}</div>
      ) : null}
    </div>
  );
}
