import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { registerEdgeGlow } from "@/lib/edge-glow";
import { cn } from "@/lib/utils";

/**
 * Every frosted surface on the site.
 *
 * The cursor's light on the glass — the lit arris, the bloom, the reflected
 * source, the grime it rakes out — is NOT here. It lives in one shared WebGL
 * pass (components/site/GlassLight.tsx) because those are all the same light
 * seen several ways and have to be able to sum past white, which stacked CSS
 * layers cannot do; they can only paint over one another. What remains here is
 * what the pane is like with no light on it at all.
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
      {/* The bezel, bending and dispersing what is behind it. */}
      <span aria-hidden="true" className="glass__refract glass__refract--top" />
      <span aria-hidden="true" className="glass__refract glass__refract--bottom" />
      {/*
        The two side faces — the actual thickness of the pane, between its
        arrises. Which one you can see depends on where the panel sits relative
        to your eye, so they open and close against each other as you scroll.
      */}
      <span aria-hidden="true" className="glass__side glass__side--top" />
      <span aria-hidden="true" className="glass__side glass__side--bottom" />
      {/* Reflectivity rising toward the rim, the way glass does at grazing angles. */}
      <span aria-hidden="true" className="glass__fresnel" />
      {/* The room, reflected. Always there; parallaxes against the pointer. */}
      <span aria-hidden="true" className="glass__reflection" />
      {/* The specular band the shutter flash sweeps across the panel. */}
      <span aria-hidden="true" className="glass__glare" />
      {children}
    </Tag>
  );
}
