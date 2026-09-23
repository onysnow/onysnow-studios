import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";
import { VARIANT_WIDTHS } from "@/lib/photo-url";

export type PreparedVariant = { width: number; file: File };

export type PreparedImage = {
  /** The largest rendition — also the row's `storage_path`. */
  file: File;
  width: number;
  height: number;
  blurDataUrl: string;
  /** Smaller renditions, keyed by rendered width. */
  variants: PreparedVariant[];
};

const MAX_EDGE = 2560;
const QUALITY = 0.82;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function blurPlaceholder(bitmap: ImageBitmap): string {
  const long = 20;
  const ratio = bitmap.width / bitmap.height;
  const w = ratio >= 1 ? long : Math.max(8, Math.round(long * ratio));
  const h = ratio >= 1 ? Math.max(8, Math.round(long / ratio)) : long;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.filter = "blur(1px)";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/webp", 0.5);
}

/**
 * Resize to a 2560px long edge, then produce the smaller renditions the site
 * actually renders. Without these a gallery row 280px tall still downloads the
 * full 2560px file, which is the single largest cost on a photography site.
 */
export async function prepareImage(input: File): Promise<PreparedImage> {
  const base = await imageCompression(input, {
    maxWidthOrHeight: MAX_EDGE,
    initialQuality: QUALITY,
    fileType: "image/webp",
    useWebWorker: true,
  });
  const bitmap = await loadBitmap(base);
  const blurDataUrl = blurPlaceholder(bitmap);
  const stem = input.name.replace(/\.[^.]+$/, "") || "photo";

  // Only generate widths smaller than the image itself — upscaling helps nobody.
  const targets = VARIANT_WIDTHS.filter((w) => w < bitmap.width);
  const variants: PreparedVariant[] = [];
  for (const width of targets) {
    const resized = await imageCompression(base, {
      maxWidthOrHeight: width,
      initialQuality: QUALITY,
      fileType: "image/webp",
      useWebWorker: true,
    });
    variants.push({
      width,
      file: new File([resized], `${stem}-${width}.webp`, { type: "image/webp" }),
    });
  }

  const result: PreparedImage = {
    file: new File([base], `${stem}.webp`, { type: "image/webp" }),
    width: bitmap.width,
    height: bitmap.height,
    blurDataUrl,
    variants,
  };
  bitmap.close?.();
  return result;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "photo"
  );
}

/** Upload one file plus its responsive renditions, then create its photos row. */
export async function uploadPhoto(input: File, categoryId: string | null, sortOrder: number) {
  const prepared = await prepareImage(input);
  const stem = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${slugify(input.name)}`;
  const path = `${stem}.webp`;

  // Paths are content-unique, so these objects can be cached indefinitely.
  const uploadOptions = { contentType: "image/webp", upsert: false, cacheControl: "31536000" };

  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, prepared.file, uploadOptions);
  if (uploadError) throw uploadError;

  const sources: Record<string, string> = {};
  for (const variant of prepared.variants) {
    const variantPath = `${stem}-${variant.width}.webp`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(variantPath, variant.file, uploadOptions);
    // A missing rendition degrades quality, not correctness — the original still
    // serves. Don't fail the whole upload over one variant.
    if (!error) sources[String(variant.width)] = variantPath;
  }

  const { error } = await supabase.from("photos").insert({
    storage_path: path,
    width: prepared.width,
    height: prepared.height,
    blur_data_url: prepared.blurDataUrl,
    sources,
    alt: "",
    title: input.name.replace(/\.[^.]+$/, ""),
    category_id: categoryId,
    sort_order: sortOrder,
    published: true,
  });
  if (error) throw error;
  return path;
}

export async function deletePhoto(
  id: string,
  storagePath: string,
  sources?: Record<string, string> | null,
) {
  const paths = [storagePath, ...Object.values(sources ?? {})].filter(Boolean);

  // The row is what the site reads, so its delete is the one that decides
  // whether this succeeded. A storage failure leaves orphaned objects, which is
  // worth knowing about but is not worth keeping the photograph on the site
  // over -- so it is reported rather than thrown.
  const removed = await supabase.storage.from("photos").remove(paths);

  const { error } = await supabase.from("photos").delete().eq("id", id);
  if (error) throw error;

  return { orphanedFiles: removed.error ? paths.length : 0 };
}
