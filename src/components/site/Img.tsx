import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { PortfolioImage } from "@/data/portfolio";

type ImgProps = {
  image: PortfolioImage;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
};

export function Img({ image, sizes = "(min-width: 1024px) 50vw, 100vw", className, imgClassName, eager = false }: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const ratio = `${image.width} / ${image.height}`;
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio } as CSSProperties}>
      <img aria-hidden="true" alt="" src={image.blurSrc} className="absolute inset-0 size-full scale-110 object-cover blur-xl" />
      <picture>
        <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />
        <source type="image/webp" srcSet={image.webpSrcSet} sizes={sizes} />
        <img
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn("absolute inset-0 size-full object-cover transition duration-700", loaded ? "opacity-100" : "opacity-0", imgClassName)}
        />
      </picture>
    </span>
  );
}
