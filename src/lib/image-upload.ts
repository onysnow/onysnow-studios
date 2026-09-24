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

/** The real pixel width of an encoded image. */
async function widthOf(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  bitmap.close();
  return width;
}

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
/**
 * Does this look like a HEIC/HEIF the browser cannot decode?
 *
 * Checked by CONTENT, not extension: iOS often hands over a file called
 * `image.jpg` that is HEIC inside, and a phone photo renamed by hand is not
 * rare either. The ISO base-media box at bytes 4-8 is `ftyp`, and the brand
 * that follows says which flavour -- `heic`, `heix`, `hevc`, `mif1`, `msf1`.
 *
 * Worth the twelve bytes because the failure without it is inscrutable:
 * createImageBitmap rejects with a generic decode error, which surfaces as
 * "Could not upload IMG_5742.jpg" and tells nobody anything.
 */
async function looksLikeHeic(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length < 12) return false;
    const tag = String.fromCharCode(...head.slice(4, 8));
    if (tag !== "ftyp") return false;
    const brand = String.fromCharCode(...head.slice(8, 12)).toLowerCase();
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"].includes(brand);
  } catch {
    // Unreadable header is not proof of anything; let the decoder decide.
    return false;
  }
}

export async function prepareImage(input: File): Promise<PreparedImage> {
  if (await looksLikeHeic(input)) {
    throw new Error(
      "That is a HEIC photo, which browsers cannot open. On iPhone: Settings > " +
        "Camera > Formats > Most Compatible, or share it to yourself first — " +
        "either gives you a JPEG.",
    );
  }

  const base = await imageCompression(input, {
    maxWidthOrHeight: MAX_EDGE,
    initialQuality: QUALITY,
    fileType: "image/webp",
    useWebWorker: true,
  });
  const bitmap = await loadBitmap(base);
  const blurDataUrl = blurPlaceholder(bitmap);
  const stem = input.name.replace(/\.[^.]+$/, "") || "photo";

  /*
   * Only widths smaller than the image itself — upscaling helps nobody.
   *
   * `bitmap` is the already-resized base, so its long edge is at most
   * MAX_EDGE. That is why the 2560 entry never produced anything: for a
   * landscape photograph the width IS 2560 and `2560 < 2560` is false. The
   * lightbox therefore topped out at a 1280w candidate on any display, and
   * photo-url.ts advertised a size that did not exist.
   */
  const targets = VARIANT_WIDTHS.filter((w) => w < bitmap.width);
  const variants: PreparedVariant[] = [];
  for (const width of targets) {
    const resized = await imageCompression(base, {
      maxWidthOrHeight: width,
      initialQuality: QUALITY,
      fileType: "image/webp",
      useWebWorker: true,
    });

    /*
     * Named by what came out, not by what was asked for.
     *
     * `maxWidthOrHeight` constrains the LONGER edge, so a 2:3 portrait asked
     * for 1280 comes back 853 wide. Labelling that file `1280w` tells the
     * browser it is half again as wide as it is, so it picks a candidate too
     * small for the slot — a visible upscale on a photography site. Measuring
     * the result costs one decode and makes the descriptor true.
     */
    const actual = await widthOf(resized).catch(() => width);
    variants.push({
      width: actual,
      file: new File([resized], `${stem}-${actual}.webp`, { type: "image/webp" }),
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
    /*
     * Not published, and not silently without a description.
     *
     * Every upload used to land `alt: ""` AND `published: true`, so the
     * default outcome was a photograph live on the site that a screen reader
     * announces as nothing at all. In the gallery that is a row of buttons
     * reading "button, button, button"; in the footer strip it is a link with
     * no accessible name whatsoever.
     *
     * The alt is seeded from the filename, which is not a description but is
     * at least something, and is the same thing the title already did. The row
     * stays unpublished until the studio has looked at it, which is a better
     * default for a photography site regardless of accessibility — a
     * photograph should reach the public because someone chose it.
     */
    alt: describeFrom(input.name),
    title: input.name.replace(/\.[^.]+$/, ""),
    category_id: categoryId,
    sort_order: sortOrder,
    published: false,
  });
  if (error) throw error;
  return path;
}

/**
 * A first pass at a description, from the filename.
 *
 * `DSC_0413.jpg` yields nothing worth saying, so it yields nothing; a name
 * somebody actually typed usually does. Either way the studio is expected to
 * replace it — this only exists so the failure mode is a weak description
 * rather than none.
 */
export function describeFrom(filename: string): string {
  const stem = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  /*
   * Camera output: a prefix and some counters, which describes nothing.
   *
   * The separators are already collapsed to spaces by this point, so
   * `PXL_20260101_120000` arrives as `PXL 20260101 120000` — the pattern has
   * to allow several number groups, not one.
   */
  if (/^(dsc|dscf|img|imgp|p|pxl|gopr|mvi|photo|image)[\s\d-]*$/i.test(stem)) return "";
  if (/^[\s\d-]+$/.test(stem)) return "";

  return stem.length > 2 ? stem.charAt(0).toUpperCase() + stem.slice(1) : "";
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

/**
 * Upload a site ASSET -- a texture, a room reflection -- and return its URL.
 *
 * Separate from `uploadPhoto` because the two have almost nothing in common
 * beyond touching storage. A photograph is a row in `photos` with categories,
 * ordering, a blur placeholder and a set of responsive renditions; an asset is
 * one file that some piece of the effect layer loads by URL and nothing else
 * ever lists.
 *
 * NOT put through `prepareImage`. That pipeline exists to make photographs
 * cheap to deliver -- 2560px long edge, WebP, smaller renditions -- and every
 * one of those steps is wrong here:
 *
 *   - The glass texture is sampled by a shader as a tiled detail map. Resizing
 *     it changes the scale of the scratches, and re-encoding a high-frequency
 *     grey texture as lossy WebP is exactly the content that codec handles
 *     worst; the blocking artefacts would show up as structure in the glass.
 *   - A room reflection is an HDRI graded through its own pipeline. Putting it
 *     through a second quality pass would undo that grading.
 *
 * So it is stored as given. These are files chosen once and looked at forever,
 * not a gallery someone uploads thirty of on a phone.
 */
export async function uploadSiteAsset(input: File, slug: string): Promise<string> {
  const extension = (input.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  /*
   * Timestamped rather than fixed, so the new file has a new URL.
   *
   * Overwriting `assets/glass-surface.jpg` in place would leave every browser
   * and CDN that already has it serving the old one -- these are uploaded with
   * a year-long cache header, because they never change except when they do.
   * A new path is the only reliable cache bust.
   */
  const path = `assets/${slug}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from("photos").upload(path, input, {
    contentType: input.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Uploaded, but storage returned no public URL");
  return data.publicUrl;
}
