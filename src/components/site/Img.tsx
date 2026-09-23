import { useCallback, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { photoSrcSet, photoUrl, type PhotoSources } from "@/lib/photo-url";
import { registerLitSurface } from "@/lib/edge-glow";

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

  /*
   * The photograph is a surface in its own right.
   *
   * It rests ON the glass, so it takes none of the pane's bevel, reflection or
   * grime -- those belong to a sheet it is lying on. What it has instead is
   * photographic paper: a broad, soft, warm gloss rather than glass's tight
   * white specular, and a much fainter view of the same room. Registering it
   * publishes where the light is standing over it; styles.css does the rest.
   */
  const release = useRef<(() => void) | null>(null);
  const surface = useCallback((el: HTMLElement | null) => {
    release.current?.();
    release.current = el ? registerLitSurface(el) : null;
  }, []);
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
      ref={surface}
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
          /*
           * `onLoad` alone is not enough.
           *
           * The markup is server-rendered, so the browser can finish fetching a
           * photograph before React hydrates and attaches this handler — and an
           * image that is already complete never fires `load` again. The result
           * was a frame stuck at `opacity-0` forever, showing nothing but its
           * blurred placeholder. Anything served from cache hit this on every
           * repeat visit.
           *
           * The ref runs at attach time and catches exactly that case.
           */
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
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
      {/*
        Paper gloss and a trace of the room. Above the photograph, below
        nothing -- anything laid over the picture itself belongs here.
      */}
      <span aria-hidden="true" className="photo-surface" />
    </span>
  );
}
