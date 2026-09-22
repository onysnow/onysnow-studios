import { useCallback, useRef, type ElementType, type ReactNode } from "react";
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
  /*
   * A callback ref, NOT useRef plus an empty-dependency effect.
   *
   * An effect with no dependencies runs once, on mount. If React later swaps
   * the underlying DOM node while the component stays mounted — which it does
   * to this subtree during hydration — the object ref quietly points at the
   * new node and the effect never runs again, so the panel is never
   * registered. That is exactly what happened: the header, which lives in the
   * root layout, lit correctly while every content band on the page sat on
   * its CSS fallbacks with no thickness and no cursor response at all.
   *
   * A callback ref is invoked with every node React attaches, so registration
   * follows the element rather than the component's lifetime.
   */
  const release = useRef<(() => void) | null>(null);
  const attach = useCallback((el: HTMLElement | null) => {
    release.current?.();
    release.current = el ? registerEdgeGlow(el) : null;
  }, []);

  return (
    <Tag
      ref={attach}
      className={cn(
        "glass",
        variant === "bar" && "glass--bar",
        overlap && "-mt-14 lg:-mt-24",
        className,
      )}
    >
      {/* Bright points behind the glass, thrown out of focus into discs. */}
      <span aria-hidden="true" className="glass__bokeh" />
      {/*
        The bezel, bending and dispersing what is behind it. One layer over the
        whole pane: the displacement map carries the profile, pushing at the
        edges and neutral through the middle, which is what a bevel IS.
      */}
      <span aria-hidden="true" className="glass__refract" />
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
