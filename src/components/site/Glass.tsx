import { useEffect, useCallback, useRef, type ElementType, type ReactNode } from "react";
import { registerEdgeGlow } from "@/lib/edge-glow";
import { requestBevelFilter } from "@/lib/bevel-filters";
import { registerLitSurface } from "@/lib/edge-glow";
import { registerPane } from "@/lib/glass-panes";
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
  /*
   * The node, kept so the effect below can register it.
   *
   * The ref callback cannot do that registration itself: refs are attached
   * during the commit, and the thing being guarded against is anything
   * touching this element before React has finished hydrating it. An effect
   * is the guarantee -- React does not run a subtree's effects until it has
   * committed that subtree.
   */
  const node = useRef<HTMLElement | null>(null);

  const attach = useCallback((el: HTMLElement | null) => {
    node.current = el;
    release.current?.();
    if (!el) {
      release.current = null;
      return;
    }

    const unregister = registerEdgeGlow(el);

    /*
     * The bevel map depends on the pane's size and corner radius.
     *
     * It used to be one baked PNG stretched over every pane, which meant a
     * 64px bar and a 400px band were bent by the same profile -- so the bevel
     * was a different physical depth on each, which is the one thing a bevel
     * is not. The map is computed per geometry now (lib/bevel-map.ts), so the
     * pane has to ask for the filter that matches it and point its refraction
     * layer at it. Until that resolves, the CSS fallback in styles.css stands.
     */
    const refract = el.querySelector<HTMLElement>(".glass__refract");
    const fit = () => {
      if (!refract) return;
      const rect = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const id = requestBevelFilter({ width: rect.width, height: rect.height, radius });
      if (id) refract.style.backdropFilter = `url("#${id}")`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);

    /*
     * The copy resting on the pane casts a shadow too.
     *
     * Registered per block rather than once for the whole panel: the light is
     * a cursor a few hundred pixels away, not the sun, so the direction it
     * throws a heading at one end of a full-width band is visibly not the
     * direction it throws a paragraph at the other. Done here so no call site
     * has to know about it.
     */
    const copy = [...el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p, blockquote")];
    const letGo = copy.map((node) => registerLitSurface(node));

    release.current = () => {
      observer.disconnect();
      for (const stop of letGo) stop();
      unregister();
    };
  }, []);

  /*
   * Tell the rasterised glass this pane exists, and that it is safe to touch.
   * See lib/glass-panes.ts -- this effect is the whole reason that registry
   * exists rather than a querySelectorAll.
   */
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    return registerPane(el);
  }, []);

  return (
    <Tag
      ref={attach}
      /*
       * This element's attributes are set from outside React, by design.
       *
       * `applyGlassConfig` writes `data-config` here -- it is how the tuning
       * panel reaches the rasterised glass, which watches the attribute with
       * a MutationObserver -- and `RasterGlass` writes `data-liquid` once a
       * pane's instance is up. The server renders neither, so React finds
       * attributes it did not put there and reports a hydration mismatch it
       * cannot patch up.
       *
       * Same situation, and the same answer, as the <html> element in
       * __root.tsx: the honest fix is to tell React this element's attributes
       * are not its business, rather than to delay the writes until hydration
       * happens to be finished. A frame's delay was tried and did not hold --
       * lazily-loaded route content is still hydrating well after the first
       * paint, so the race just moved.
       */
      suppressHydrationWarning
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
