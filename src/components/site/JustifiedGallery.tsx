import { useMemo, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { photoUrl } from "@/lib/photo-url";
import type { Photo } from "@/lib/content";

/**
 * A justified-rows gallery: images of mixed aspect ratios are fitted into
 * full-width rows of equal height, so the set reads as one fluid composition
 * rather than a column grid. Clicking any frame opens the lightbox.
 */
export function JustifiedGallery({ images, spacing = 6 }: { images: Photo[]; spacing?: number }) {
  const [index, setIndex] = useState(-1);

  const slides = useMemo(
    () =>
      images.map((image) => ({
        src: photoUrl(image.storage_path),
        alt: image.alt,
        width: image.width || 1600,
        height: image.height || 1067,
        key: image.id,
      })),
    [images],
  );

  if (images.length === 0) return null;

  return (
    <>
      <RowsPhotoAlbum
        photos={slides}
        spacing={spacing}
        targetRowHeight={(containerWidth) =>
          containerWidth < 640 ? 200 : containerWidth < 1200 ? 280 : 360
        }
        rowConstraints={{ singleRowMaxHeight: 520 }}
        onClick={({ index: i }) => setIndex(i)}
        componentsProps={{
          image: {
            className: "gallery-frame",
            loading: "lazy",
            decoding: "async",
          },
        }}
      />
      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
        controller={{ closeOnBackdropClick: true }}
      />
    </>
  );
}
