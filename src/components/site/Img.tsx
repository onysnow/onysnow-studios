import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { photoUrl } from "@/lib/photo-url";

/** Minimal shape needed to render a stored photograph. */
export type ImgSource = {
  storage_path: string;
  width?: number | null;
  height?: number | null;
  blur_data_url?: string | null;
  alt?: string | null;
};

type ImgProps = {
  image: ImgSource | null | undefined;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  alt?: string;
};

/**
 * The single image abstraction for the site. Consumes a storage path plus a
 * stored base64 blur placeholder — no build-time image pipeline involved.
 */
export function Img({ image, sizes, className, imgClassName, eager = false, alt }: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const width = image?.width ?? 1600;
  const height = image?.height ?? 1067;
  const src = photoUrl(image?.storage_path);
  const blur = image?.blur_data_url || undefined;

  return (
    <span
      className={cn("relative block overflow-hidden bg-muted", className)}
      style={{ aspectRatio: `${width} / ${height}` } as CSSProperties}
    >
      {blur ? (
        <img aria-hidden="true" alt="" src={blur} className="absolute inset-0 size-full scale-110 object-cover blur-xl" />
      ) : null}
      {src ? (
        <img
          src={src}
          alt={alt ?? image?.alt ?? ""}
          width={width}
          height={height}
          sizes={sizes}
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
