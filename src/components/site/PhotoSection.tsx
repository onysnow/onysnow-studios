import type { ReactNode } from "react";
import { ParallaxScene } from "./ParallaxScene";
import { GlassSection } from "./GlassSection";
import { BokehField } from "./BokehField";
import type { ImgSource } from "./Img";

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
}: {
  image: ImgSource | null | undefined;
  children: ReactNode;
  depth?: "subtle" | "standard" | "deep";
  className?: string;
}) {
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
      <GlassSection overlap={false}>{children}</GlassSection>
    </ParallaxScene>
  );
}
