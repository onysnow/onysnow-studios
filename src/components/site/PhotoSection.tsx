import { useEffect, useRef, type ReactNode } from "react";
import { ParallaxScene } from "./ParallaxScene";
import { GlassSection } from "./GlassSection";
import { BokehField } from "./BokehField";
import { TransmittedLight } from "./TransmittedLight";
import type { ImgSource } from "./Img";
import { cn } from "@/lib/utils";

/**
 * A content section with a photograph behind it.
 *
 * The photograph parallaxes as you pass it and the content rides on a sheet of
 * frosted glass over the top. This is the combination that makes the glass mean
 * anything: blurring a flat background is indistinguishable from a slightly
 * lighter panel, so the glass needs a picture underneath before it reads as
 * glass at all.
 *
 * Height comes from the content rather than the viewport — these are sections
 * to be read, not full-screen stages. `scrim="none"` because the glass is
 * already doing the dimming; a scrim underneath as well just makes mud.
 */
export function PhotoSection({
  image,
  children,
  depth = "standard",
  className,
  seam = false,
}: {
  image: ImgSource | null | undefined;
  children: ReactNode;
  depth?: "subtle" | "standard" | "deep";
  className?: string;
  /**
   * Sit across the join between the photographs either side, and show
   * THEM through the glass instead of a picture of its own. `image` is then
   * unused. See SeamSection.
   */
  seam?: boolean;
}) {
  if (seam) return <SeamSection className={className}>{children}</SeamSection>;
  return (
    <ParallaxScene
      image={image}
      depth={depth}
      scrim="none"
      height=""
      {...(className ? { className } : {})}
    >
      {/* Behind the glass, so the panel's blur is what turns these into bokeh. */}
      <BokehField />
      {/*
        Between the photograph and the glass: the light that made it through,
        scattered by the pane's grime and piled up at its bevel.
      */}
      <TransmittedLight />
      <GlassSection overlap={false}>{children}</GlassSection>
    </ParallaxScene>
  );
}

/**
 * A glass band laid across the join between two photographs.
 *
 * Each band used to carry its own third photograph behind it, so the glass
 * over the hero's lower edge was showing some unrelated frame -- reported as
 * "the background is supposed to be the rest of the hero image from above and
 * below". Now the band has no picture. The photograph above grows down under
 * its top half and the one below grows up under its bottom half, meeting in
 * the middle behind the glass: the pane really is floating over the seam, and
 * both the CSS backdrop and the liquid shader's capture see the real images,
 * continuous with what is visible either side.
 *
 * Layout does not move. The neighbours grow by exactly the overlap (SEAM_ROOM
 * in ParallaxScene) and this band pulls in by the same amount with negative
 * margins, so every heading and button stays where it was.
 *
 * The pane and its light layers sit above both neighbours in z, so the light
 * -- which blooms past the pane's edge on purpose -- lands on the photographs
 * instead of being painted over by the next section. That overlap was the
 * "bloom clipped at the edges". The z-index is on the children (styles.css,
 * `[data-seam] > ...`), NOT on this wrapper: a z-indexed wrapper is a stacking
 * context, Chrome cuts the pane's backdrop off at it, and the glass then
 * frosts nothing and the photographs show through it untouched. Measured.
 */
function SeamSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const photo = (n: Element | null) =>
      n instanceof HTMLElement && n.hasAttribute("data-photo") && !n.hasAttribute("data-seam")
        ? n
        : null;
    const above = photo(el.previousElementSibling);
    const below = photo(el.nextElementSibling);
    if (!above && !below) return;

    const fit = () => {
      const h = el.getBoundingClientRect().height;
      // Split at the middle; if one side has no photograph, the other takes it all.
      const up = above ? (below ? h / 2 : h) : 0;
      const down = below ? h - up : 0;
      above?.style.setProperty("--seam-below", `${up}px`);
      below?.style.setProperty("--seam-above", `${down}px`);
      el.style.marginTop = `${-up}px`;
      el.style.marginBottom = `${-down}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => {
      observer.disconnect();
      above?.style.removeProperty("--seam-below");
      below?.style.removeProperty("--seam-above");
      el.style.marginTop = "";
      el.style.marginBottom = "";
    };
  }, []);

  return (
    /*
     * data-photo stays: the cursor and the shutter treat the glass over a
     * photograph as part of it. data-seam tells the glass code the picture
     * behind this band belongs to its neighbours.
     */
    <div ref={ref} data-photo data-seam className={cn("relative", className)}>
      <BokehField />
      <TransmittedLight />
      <GlassSection overlap={false}>{children}</GlassSection>
    </div>
  );
}
