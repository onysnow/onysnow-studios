import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ImageIcon, RotateCcw } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { FocusPicker } from "@/components/admin/FocusPicker";
import { Img } from "@/components/site/Img";
import { adminCategoriesQuery, adminPhotosQuery } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Photo } from "@/lib/content";
import {
  PAGES,
  PHOTO_SLOTS,
  adminPagePhotosQuery,
  clearPagePhoto,
  resolveSlot,
  setPagePhoto,
  type Focus,
  type PagePhotoRow,
  type PhotoSlot,
} from "@/lib/page-photos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import SETUP_SQL from "../../../supabase/migrations/20260929120000_page_photos.sql?raw";

export const Route = createFileRoute("/_authenticated/admin/page-photos")({
  component: PagePhotosPage,
});

/**
 * Page photos: choose the photograph for each spot on each page, and what to
 * keep in frame there. Replaces the star and "position in the photo list"
 * (see lib/page-photos and the project doc claude/page-photos-design.md).
 */
function PagePhotosPage() {
  const chosen = useQuery(adminPagePhotosQuery);
  const photos = useQuery(adminPhotosQuery);
  const refresh = useContentRefresh();
  const [picking, setPicking] = useState<PhotoSlot | null>(null);

  // What the public site's automatic rule sees: published, in library order, the first 24.
  const published = useMemo(
    () => (photos.data ?? []).filter((p) => p.published).slice(0, 24),
    [photos.data],
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

  async function clear(key: string) {
    try {
      await clearPagePhoto(key);
      refresh();
    } catch (error) {
      toast.error("Could not reset", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const pages = [...new Set(PHOTO_SLOTS.map((s) => s.page))];

  return (
    <>
      <AdminHeading
        title="Page photos"
        description="Choose the photograph for each spot on the site, then click it to set the point to keep in frame. A spot you haven't chosen shows a photograph automatically."
      />

      {chosen.data?.missing ? <SetupNotice /> : null}

      {chosen.isPending || photos.isPending ? (
        <div className="grid gap-6">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : (
        pages.map((page) => (
          <section key={page} className="mb-12">
            <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {PAGES[page] ?? page}
            </h2>
            <div className="grid gap-6">
              {PHOTO_SLOTS.filter((s) => s.page === page).map((slot) => (
                <SlotCard
                  key={slot.key}
                  slot={slot}
                  rows={chosen.data?.rows ?? []}
                  published={published}
                  disabled={!!chosen.data?.missing}
                  onChoose={() => setPicking(slot)}
                  onFocus={(photoId, focus) => save(slot.key, photoId, focus)}
                  onClear={() => clear(slot.key)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <PhotoChooser
        slot={picking}
        photos={photos.data ?? []}
        current={picking ? chosen.data?.rows.find((r) => r.key === picking.key)?.photo_id : null}
        onClose={() => setPicking(null)}
        onPick={(photo) => {
          if (picking) void save(picking.key, photo.id, null);
          setPicking(null);
        }}
      />
    </>
  );
}

function SlotCard({
  slot,
  rows,
  published,
  disabled,
  onChoose,
  onFocus,
  onClear,
}: {
  slot: PhotoSlot;
  rows: readonly PagePhotoRow[];
  published: readonly Photo[];
  disabled: boolean;
  onChoose: () => void;
  onFocus: (photoId: string, focus: Focus) => void;
  onClear: () => void;
}) {
  const row = rows.find((r) => r.key === slot.key);
  const shown = resolveSlot(slot.key, rows, published);
  // The admin can see unpublished photographs; the public site can't, and
  // shows the automatic one instead until it is published.
  const hidden = row?.photo && !row.photo.published;
  const focus = shown.chosen ? shown.focus : null;

  return (
    <div className="grid gap-6 rounded-lg border border-border bg-card p-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div>
        {shown.photo && shown.chosen && row?.photo_id ? (
          <FocusPicker
            image={shown.photo}
            focus={focus}
            label={`Point to keep in frame for ${slot.label}`}
            onChange={(f) => onFocus(row.photo_id!, f)}
          />
        ) : shown.photo ? (
          <Img image={shown.photo} sizes="360px" className="rounded-md opacity-80" />
        ) : (
          <div className="grid aspect-[3/2] place-items-center rounded-md bg-muted text-muted-foreground">
            <ImageIcon className="size-6" />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {shown.chosen
            ? focus
              ? "Click the photograph to move the point kept in frame."
              : "Click the photograph to choose the point kept in frame (now: the centre)."
            : "Automatic. Choose a photograph to set this spot and its framing."}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-2xl leading-none">{slot.label}</h3>
            <Badge variant={shown.chosen ? "default" : "secondary"}>
              {shown.chosen ? "Chosen" : "Automatic"}
            </Badge>
            {hidden ? <Badge variant="destructive">Not published</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{slot.where}</p>
          {hidden ? (
            <p className="mt-1 text-sm text-destructive">
              This photograph isn't published, so the site shows the automatic one here until it is.
              Publish it on the Photos page.
            </p>
          ) : null}
        </div>

        {shown.photo ? (
          <div className="flex flex-wrap items-end gap-4" aria-label="How it is cropped">
            {slot.previews.map((p) => (
              <figure key={p.label} className="m-0">
                <div
                  className="relative overflow-hidden rounded-md border border-border"
                  style={{ height: 150, width: Math.round(150 * p.aspect) }}
                >
                  <Img
                    image={shown.photo}
                    className="h-full w-full"
                    sizes={`${Math.round(150 * p.aspect * 2)}px`}
                    focus={focus}
                  />
                </div>
                <figcaption className="mt-1 text-xs text-muted-foreground">{p.label}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2">
          <Button onClick={onChoose} disabled={disabled}>
            <ImageIcon /> {shown.chosen ? "Change photograph" : "Choose photograph"}
          </Button>
          {row ? (
            <Button variant="outline" onClick={onClear} disabled={disabled}>
              <RotateCcw /> Back to automatic
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ALL = "__all__";

function PhotoChooser({
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
  const [shape, setShape] = useState<"any" | "wide" | "tall">("any");

  const list = photos.filter(
    (p) =>
      (category === ALL || p.category_id === category) &&
      (shape === "any" || (shape === "wide" ? p.width >= p.height : p.height > p.width)),
  );

  return (
    <Dialog open={!!slot} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90svh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a photograph{slot ? ` for ${slot.label}` : ""}</DialogTitle>
          <DialogDescription>{slot?.where}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={shape} onValueChange={(v) => setShape(v as typeof shape)}>
            <SelectTrigger className="w-40" aria-label="Shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any shape</SelectItem>
              <SelectItem value="wide">Wide</SelectItem>
              <SelectItem value="tall">Tall</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No photographs match. Upload them on the Photos page.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => onPick(photo)}
                  className={cn(
                    "group block w-full overflow-hidden rounded-md border text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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

/** Shown until the table exists: the one piece of SQL to paste into Supabase. */
function SetupNotice() {
  return (
    <div className="mb-10 rounded-lg border border-primary/40 bg-primary/5 p-5">
      <h2 className="font-display text-xl">One step to switch this on</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Page photos need a small table in the database. Open your Supabase project, go to SQL
        Editor, paste the block below and press Run. It is safe to run twice, and it keeps your
        current hero. Until then every spot stays automatic, as the site was before.
      </p>
      <div className="mt-4 flex gap-2">
        <Button
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
      </div>
      <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{SETUP_SQL}</pre>
    </div>
  );
}
