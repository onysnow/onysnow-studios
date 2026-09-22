import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { photoSrcSet, photoUrl, type PhotoSources } from "@/lib/photo-url";

/** Minimal shape needed to render a stored photograph. */
export type ImgSource = {
  storage_path: string;
  width?: number | null;
  height?: number | null;
  blur_data_url?: string | null;
  sources?: PhotoSources | null;
  alt?: string | null;
};

type ImgProps = {
  image: ImgSource | null | undefined;
  /** Rendered width at each breakpoint. Required for `srcset` to mean anything. */
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  alt?: string;
};

/**
 * The single image abstraction for the site: a blurred placeholder that fades to
 * the photograph, an aspect-ratio box so nothing shifts, and a real `srcset` so
 * the browser downloads a rendition matched to how large it is actually drawn.
 */
export function Img({
  image,
  sizes = "100vw",
  className,
  imgClassName,
  eager = false,
  alt,
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const width = image?.width ?? 1600;
  const height = image?.height ?? 1067;
  const src = photoUrl(image?.storage_path);
  const srcSet = photoSrcSet(image?.storage_path, image?.sources, image?.width);
  const blur = image?.blur_data_url || undefined;

  // When the caller fixes the box (aspect-*, h-*, size-*, inset-0), that wins.
  // Setting the photograph's intrinsic ratio inline would override the class and
  // let a portrait frame blow out a row of landscape ones.
  const boxed = /(^|\s)(aspect-|h-|size-|inset-)/.test(className ?? "");
  const style = boxed ? undefined : ({ aspectRatio: `${width} / ${height}` } as CSSProperties);

  return (
    <span
      className={cn("relative block overflow-hidden bg-muted", className)}
      {...(style ? { style } : {})}
    >
      {blur ? (
        <img
          aria-hidden="true"
          alt=""
          src={blur}
          className="absolute inset-0 size-full scale-110 object-cover blur-xl"
        />
      ) : null}
      {src ? (
        <img
          src={src}
          {...(srcSet ? { srcSet } : {})}
          sizes={sizes}
          alt={alt ?? image?.alt ?? ""}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-700",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      ) : null}
    </span>
  );
}
