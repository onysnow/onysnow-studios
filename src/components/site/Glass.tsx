import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { registerEdgeGlow } from "@/lib/edge-glow";
import { cn } from "@/lib/utils";

/**
 * Every frosted surface on the site.
 *
 * There used to be three of these — the content bands, the header and the
 * filter bar each had their own blur, tint and border, and they had drifted
 * far enough apart that the header never matched the sections. This owns the
 * class, the cursor registration and the bloom layer in one place, so a change
 * to how glass behaves is a change here and nowhere else.
 *
 * `variant="bar"` is the thin fixed bars: less tint, shallower bezel.
 */
export function Glass({
  children,
  className,
  as: Tag = "div",
  variant = "panel",
  /** Pulls the band up over whatever it follows, so its top edge has a photograph behind it. */
  overlap = false,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  variant?: "panel" | "bar";
  overlap?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerEdgeGlow(el);
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(
        "glass",
        variant === "bar" && "glass--bar",
        overlap && "-mt-14 lg:-mt-24",
        className,
      )}
    >
      {/* The ambient bloom the lit rim casts inward. Glass only. */}
      <span aria-hidden="true" className="glass__bloom" />
      {/* Finger streaks and grime, visible only where the light rakes across. */}
      <span aria-hidden="true" className="glass__smudge" />
      {/* Specular reflection, travelling against the light the way one does. */}
      <span aria-hidden="true" className="glass__reflection" />
      {children}
    </Tag>
  );
}
