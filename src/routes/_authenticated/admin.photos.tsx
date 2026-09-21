import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { SortableItem, SortableList } from "@/components/admin/SortableList";
import { Img } from "@/components/site/Img";
import { adminCategoriesQuery, adminPhotosQuery, deleteRow, saveOrder, updateRow } from "@/lib/admin";
import { deletePhoto, uploadPhoto } from "@/lib/image-upload";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Photo } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/photos")({ component: PhotosPage });

const UNASSIGNED = "__none__";

function PhotosPage() {
  const photos = useQuery(adminPhotosQuery);
  const categories = useQuery(adminCategoriesQuery);
  const refresh = useContentRefresh();

  const [filter, setFilter] = useState<string>("all");
  const [uploading, setUploading] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>(UNASSIGNED);

  const visible = useMemo(() => {
    const list = (photos.data ?? []).filter((p) => (filter === "all" ? true : p.category_id === filter));
    if (!order) return list;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [photos.data, filter, order]);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(files.length);
    const base = (photos.data ?? []).length;
    let done = 0;
    for (const [i, file] of files.entries()) {
      try {
        await uploadPhoto(file, uploadCategory === UNASSIGNED ? null : uploadCategory, base + i + 1);
        done++;
      } catch (error) {
        toast.error(`Could not upload ${file.name}`, { description: error instanceof Error ? error.message : undefined });
      }
      setUploading(files.length - i - 1);
    }
    setUploading(0);
    if (done) toast.success(`${done} photograph${done === 1 ? "" : "s"} uploaded`);
    refresh();
  }, [photos.data, uploadCategory, refresh]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"] },
    multiple: true,
  });

  async function patch(id: string, values: Partial<Photo>) {
    try {
      await updateRow("photos", id, values);
      refresh();
    } catch (error) {
      toast.error("Could not save that change", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function reorder(ids: string[]) {
    setOrder(ids);
    try {
      await saveOrder("photos", ids);
      refresh();
    } catch {
      toast.error("Could not save the new order");
    }
  }

  async function removeSelected() {
    const list = (photos.data ?? []).filter((p) => selected.includes(p.id));
    for (const p of list) {
      try {
        await deletePhoto(p.id, p.storage_path);
      } catch {
        try { await deleteRow("photos", p.id); } catch { /* ignore */ }
      }
    }
    setSelected([]);
    toast.success(`${list.length} photograph${list.length === 1 ? "" : "s"} deleted`);
    refresh();
  }

  return (
    <>
      <AdminHeading
        title="Photos"
        description="Drop in new photographs — they are resized to 2560px, converted to WebP and given a blurred preview automatically."
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors",
            isDragActive && "border-primary bg-primary/5",
          )}
        >
          <input {...getInputProps()} />
          {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <UploadCloud className="size-6 text-primary" />}
          <p className="font-medium">{uploading ? `Uploading… ${uploading} left` : "Drag photographs here, or click to choose"}</p>
          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or HEIC. Multiple files welcome.</p>
        </div>
        <div className="space-y-2">
          <Label>Add to category</Label>
          <Select value={uploadCategory} onValueChange={setUploadCategory}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>No category</SelectItem>
              {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => { setFilter(v); setOrder(null); }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All photographs</SelectItem>
            {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{visible.length} shown</span>
        <span className="flex-1" />
        {selected.length ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 /> Delete {selected.length}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.length} photograph{selected.length === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>This removes the files as well and cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep them</AlertDialogCancel>
                <AlertDialogAction onClick={removeSelected}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      {photos.isLoading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[3/2] w-full" />)}
        </div>
      ) : (
        <SortableList
          ids={visible.map((p) => p.id)}
          onReorder={reorder}
          className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((photo) => (
            <SortableItem key={photo.id} id={photo.id}>
              <div className="rounded-lg border border-border bg-card">
                <div className="relative">
                  <Img image={photo} alt={photo.alt} className="rounded-t-lg" sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw" />
                  <label className="absolute right-2 top-2 grid size-8 place-items-center rounded-md bg-background/80 backdrop-blur">
                    <Checkbox
                      checked={selected.includes(photo.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => (v ? [...prev, photo.id] : prev.filter((id) => id !== photo.id)))
                      }
                      aria-label={`Select ${photo.title || "photograph"}`}
                    />
                  </label>
                </div>
                <div className="space-y-3 p-4">
                  <Input defaultValue={photo.title} placeholder="Title" onBlur={(e) => e.target.value !== photo.title && patch(photo.id, { title: e.target.value })} />
                  <Input defaultValue={photo.alt} placeholder="Alt text (described for screen readers)" onBlur={(e) => e.target.value !== photo.alt && patch(photo.id, { alt: e.target.value })} />
                  <Select value={photo.category_id ?? UNASSIGNED} onValueChange={(v) => patch(photo.id, { category_id: v === UNASSIGNED ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>No category</SelectItem>
                      {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={photo.published} onCheckedChange={(v) => patch(photo.id, { published: v })} /> Published
                    </label>
                    <Button
                      variant="ghost" size="icon" aria-label="Feature on the home page"
                      onClick={() => patch(photo.id, { featured: !photo.featured })}
                    >
                      <Star className={cn("size-4", photo.featured && "fill-primary text-primary")} />
                    </Button>
                  </div>
                </div>
              </div>
            </SortableItem>
          ))}
        </SortableList>
      )}
    </>
  );
}
