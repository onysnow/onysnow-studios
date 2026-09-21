import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";

export type PreparedImage = {
  file: File;
  width: number;
  height: number;
  blurDataUrl: string;
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

/** Resize to a 2560px long edge, convert to WebP, and build a tiny base64 blur preview. */
export async function prepareImage(input: File): Promise<PreparedImage> {
  const compressed = await imageCompression(input, {
    maxWidthOrHeight: MAX_EDGE,
    initialQuality: QUALITY,
    fileType: "image/webp",
    useWebWorker: true,
  });
  const bitmap = await loadBitmap(compressed);
  const blurDataUrl = blurPlaceholder(bitmap);
  const name = `${input.name.replace(/\.[^.]+$/, "") || "photo"}.webp`;
  const file = new File([compressed], name, { type: "image/webp" });
  const result = { file, width: bitmap.width, height: bitmap.height, blurDataUrl };
  bitmap.close?.();
  return result;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "photo";
}

/** Upload one file and create its photos row. */
export async function uploadPhoto(input: File, categoryId: string | null, sortOrder: number) {
  const prepared = await prepareImage(input);
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${slugify(input.name)}.webp`;

  const { error: uploadError } = await supabase.storage.from("photos").upload(path, prepared.file, {
    contentType: "image/webp",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("photos").insert({
    storage_path: path,
    width: prepared.width,
    height: prepared.height,
    blur_data_url: prepared.blurDataUrl,
    alt: "",
    title: input.name.replace(/\.[^.]+$/, ""),
    category_id: categoryId,
    sort_order: sortOrder,
    published: true,
  });
  if (error) throw error;
  return path;
}

export async function deletePhoto(id: string, storagePath: string) {
  await supabase.storage.from("photos").remove([storagePath]);
  const { error } = await supabase.from("photos").delete().eq("id", id);
  if (error) throw error;
}
