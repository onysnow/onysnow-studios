import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, ImageIcon, Loader2, RotateCcw, Upload } from "lucide-react";
import PAGE_PHOTOS_SQL from "../../../supabase/migrations/20260929120000_page_photos.sql?raw";
import SITE_PHOTOS_SQL from "../../../supabase/migrations/20261001120000_site_photos.sql?raw";
import { FocusPicker } from "@/components/admin/FocusPicker";
import { Img } from "@/components/site/Img";
import { adminCategoriesQuery, adminPhotosQuery } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Photo } from "@/lib/content";
import { uploadSitePhoto } from "@/lib/image-upload";
import {
  PAGES,
  PHOTO_SLOTS,
  adminPagePhotosQuery,
  clearPagePhoto,
  resolveSlot,
  setPagePhoto,
  type Focus,
  type PhotoSlot,
} from "@/lib/page-photos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The photographs on the site's pages, in the effect lab's side menu (item
 * 38c; Ony, 2026-10-01: "It should be like Hero image #1 Photo and then allow
 * me to change it by selecting from the portfolio or uploading").
 *
 * One card per place a photograph shows, named for where it is. Each shows
 * the photograph there now; click it to set the point kept in frame. Change
 * it by picking from the portfolio or uploading a new one -- an upload here
 * is a site photograph, kept out of the portfolio (lib/image-upload
 * uploadSitePhoto). "Automatic" hands the place back to the site's own rule.
 */
export function PagePhotosPanel({ page }: { page: string }) {
  const chosen = useQuery(adminPagePhotosQuery);
  const photos = useQuery(adminPhotosQuery);
  const refresh = useContentRefresh();
  const [picking, setPicking] = useState<PhotoSlot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const published = useMemo(
    () => (photos.data ?? []).filter((p) => p.published).slice(0, 24),
    [photos.data],
  );
  // The page in the preview first, then the rest.
  const pages = [...new Set(PHOTO_SLOTS.map((s) => s.page))].sort(
    (a, b) => Number(b === page) - Number(a === page),
  );

  async function save(key: string, photoId: string, focus: Focus | null) {
    try {
      await setPagePhoto(key, { photo_id: photoId, focus });
      refresh();
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function upload(slot: PhotoSlot, file: File) {
    setBusy(slot.key);
    try {
      const id = await uploadSitePhoto(file);
      await setPagePhoto(slot.key, { photo_id: id, focus: null });
      refresh();
      toast.success(`${slot.label}: new photograph in place`);
    } catch (error) {
      toast.error("Could not upload", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  if (chosen.data?.missing) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">One step to switch this on</p>
        <p className="text-muted-foreground">
          Choosing the photograph for each place needs a small table in the database. In your
          Supabase project open SQL Editor, paste this and press Run. It is safe to run twice and
          keeps your current hero. Then reload this page.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(SETUP_SQL).then(
              () => toast.success("SQL copied"),
              () => toast.error("Could not copy. Select the text below instead."),
            )
          }
        >
          <Copy /> Copy SQL
        </Button>
        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-2 text-[11px]">
          {SETUP_SQL}
        </pre>
      </div>
    );
  }
  if (chosen.isPending || photos.isPending) {
    return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-6" data-lab-page-photos>
      {pages.map((p) => (
        <section key={p}>
          <h3 className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {PAGES[p] ?? p}
          </h3>
          <div className="space-y-4">
            {PHOTO_SLOTS.filter((s) => s.page === p).map((slot) => {
              const row = chosen.data?.rows.find((r) => r.key === slot.key);
              const shown = resolveSlot(slot.key, chosen.data?.rows ?? [], published);
              const focus = shown.chosen ? shown.focus : null;
              return (
                <div
                  key={slot.key}
                  className="rounded-lg border border-border/60 p-3"
                  data-lab-slot={slot.key}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{slot.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {shown.chosen ? "Chosen" : "Automatic"}
                    </span>
                  </div>
                  {shown.photo && shown.chosen && row?.photo_id ? (
                    <FocusPicker
                      image={shown.photo}
                      focus={focus}
                      label={`Point to keep in frame for ${slot.label}`}
                      onChange={(f) => void save(slot.key, row.photo_id!, f)}
                    />
                  ) : shown.photo ? (
                    <Img image={shown.photo} sizes="360px" className="rounded-md opacity-80" />
                  ) : (
                    <div className="grid aspect-[3/2] place-items-center rounded-md bg-muted text-muted-foreground">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-snug text-muted-foreground">{slot.where}</p>
                  {shown.chosen ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Click the photograph to set the point kept in frame.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPicking(slot)}>
                      <ImageIcon /> From the portfolio
                    </Button>
                    <UploadButton
                      busy={busy === slot.key}
                      onFile={(file) => void upload(slot, file)}
                    />
                    {row ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void clearPagePhoto(slot.key)
                            .then(refresh)
                            .catch((e: unknown) =>
                              toast.error("Could not reset", {
                                description: e instanceof Error ? e.message : undefined,
                              }),
                            )
                        }
                      >
                        <RotateCcw /> Automatic
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <PortfolioPicker
        slot={picking}
        photos={photos.data ?? []}
        current={picking ? chosen.data?.rows.find((r) => r.key === picking.key)?.photo_id : null}
        onClose={() => setPicking(null)}
        onPick={(photo) => {
          if (picking) void save(picking.key, photo.id, null);
          setPicking(null);
        }}
      />
    </div>
  );
}

function UploadButton({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

/** Both pieces of SQL this needs: the places' table, and site photographs kept out of the portfolio. */
const SETUP_SQL = `${PAGE_PHOTOS_SQL}\n\n${SITE_PHOTOS_SQL}`;

const ALL = "__all__";

/** The portfolio, to pick a photograph from for a place on a page. */
function PortfolioPicker({
  slot,
  photos,
  current,
  onClose,
  onPick,
}: {
  slot: PhotoSlot | null;
  photos: readonly Photo[];
  current: string | null | undefined;
  onClose: () => void;
  onPick: (photo: Photo) => void;
}) {
  const categories = useQuery(adminCategoriesQuery);
  const [category, setCategory] = useState<string>(ALL);
  const list = photos.filter(
    (p) => p.in_portfolio !== false && (category === ALL || p.category_id === category),
  );
  return (
    <Dialog open={!!slot} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90svh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {slot ? `${slot.label}: pick from the portfolio` : "Pick a photograph"}
          </DialogTitle>
          <DialogDescription>{slot?.where}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {[{ id: ALL, name: "All" }, ...(categories.data ?? [])].map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={category === c.id ? "default" : "ghost"}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing here yet. Add photographs in the Portfolio section of the side menu.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => onPick(photo)}
                  className={cn(
                    "block w-full overflow-hidden rounded-md border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    photo.id === current ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                >
                  <Img image={photo} className="aspect-[4/3]" sizes="240px" />
                  <span className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                    <span className="truncate">{photo.title || "Untitled"}</span>
                    {photo.published ? null : (
                      <span className="shrink-0 text-destructive">Unpublished</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
