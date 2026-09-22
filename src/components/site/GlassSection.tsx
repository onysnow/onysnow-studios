import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A frosted content band that sits over the photograph above it.
 *
 * The negative top margin is the whole point. Frosted glass only reads as glass
 * when there is something with detail behind it to blur — over flat background
 * it is indistinguishable from a slightly lighter panel, which is how this got
 * reported as "just see-through" before. Pulling the band up over the parallax
 * image that precedes it means its top edge always has a photograph underneath.
 *
 * The shadow is cast both ways: upward onto the image it overlaps, and downward
 * onto whatever follows, so the band reads as a sheet lying on the page rather
 * than as a change of background colour.
 */
export function GlassSection({
  children,
  className,
  /** Off for a band that has nothing above it worth overlapping. */
  overlap = true,
}: {
  children: ReactNode;
  className?: string;
  overlap?: boolean;
}) {
  return (
    <div
      className={cn(
        // z-10 so the shadow lands on the image rather than behind it.
        "relative z-10 border-y border-white/10 bg-background/45",
        "backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/30",
        "shadow-[0_-22px_55px_-26px_oklch(0_0_0/0.85),0_30px_70px_-32px_oklch(0_0_0/0.95)]",
        overlap && "-mt-14 lg:-mt-24",
        className,
      )}
    >
      {children}
    </div>
  );
}
