import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Img } from "./Img";
import { photoUrl } from "@/lib/photo-url";
import type { Photo } from "@/lib/content";

export function Gallery({ images }: { images: Photo[] }) {
  const [index, setIndex] = useState(-1);
  return <>
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {images.map((image, i) => <button type="button" key={image.id} onClick={() => setIndex(i)} className="group mb-4 block w-full break-inside-avoid text-left" aria-label={`Open ${image.title} in lightbox`}><Img image={image} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" imgClassName="transition-transform duration-700 group-hover:scale-105"/><span className="mt-3 block font-display text-lg">{image.title}</span></button>)}
    </div>
    <Lightbox open={index >= 0} index={index} close={() => setIndex(-1)} slides={images.map((image) => ({ src: photoUrl(image.storage_path), alt: image.alt, width: image.width, height: image.height }))} controller={{ closeOnBackdropClick: true }} />
  </>;
}
