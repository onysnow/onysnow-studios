import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { SortableItem, SortableList } from "@/components/admin/SortableList";
import {
  adminCategoriesQuery,
  adminPhotosQuery,
  deleteRow,
  insertRow,
  saveOrder,
  updateRow,
} from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Category } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: CategoriesPage,
});

const AUTO = "__auto__";

function CategoriesPage() {
  const categories = useQuery(adminCategoriesQuery);
  const photos = useQuery(adminPhotosQuery);
  const refresh = useContentRefresh();
  const [order, setOrder] = useState<string[] | null>(null);

  const list = useMemo(() => {
    const rows = categories.data ?? [];
    if (!order) return rows;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...rows].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [categories.data, order]);

  async function patch(id: string, values: Partial<Category>) {
    try {
      await updateRow("categories", id, values);
      refresh();
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function add() {
    const n = (categories.data ?? []).length + 1;
    try {
      await insertRow("categories", {
        slug: `new-category-${n}`,
        name: "New category",
        description: "",
        sort_order: n,
        published: false,
      });
      refresh();
      toast.success("Category added");
    } catch (error) {
      toast.error("Could not add the category", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function reorder(ids: string[]) {
    setOrder(ids);
    try {
      await saveOrder("categories", ids);
      refresh();
    } catch {
      toast.error("Could not save the new order");
    }
  }

  return (
    <>
      <AdminHeading
        title="Categories"
        description="The sections of the portfolio. Unpublished categories are hidden from the website."
        action={
          <Button variant="cinematic" onClick={add}>
            <Plus /> Add category
          </Button>
        }
      />

      {categories.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : (
        <SortableList ids={list.map((c) => c.id)} onReorder={reorder} className="space-y-4">
          {list.map((c) => {
            const covers = (photos.data ?? []).filter((p) => p.category_id === c.id);
            return (
              <SortableItem key={c.id} id={c.id}>
                <div className="grid gap-4 rounded-lg border border-border bg-card p-4 pl-12 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      defaultValue={c.name}
                      onBlur={(e) =>
                        e.target.value !== c.name && patch(c.id, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Web address</Label>
                    <Input
                      defaultValue={c.slug}
                      onBlur={(e) =>
                        e.target.value !== c.slug && patch(c.id, { slug: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      defaultValue={c.description}
                      rows={2}
                      onBlur={(e) =>
                        e.target.value !== c.description &&
                        patch(c.id, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cover photograph</Label>
                    <Select
                      value={c.cover_photo_id ?? AUTO}
                      onValueChange={(v) => patch(c.id, { cover_photo_id: v === AUTO ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO}>First in the category</SelectItem>
                        {covers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title || p.storage_path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={c.published}
                        onCheckedChange={(v) => patch(c.id, { published: v })}
                      />{" "}
                      Published
                    </label>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Delete category">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{c.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Photographs stay in the library but lose this category.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await deleteRow("categories", c.id);
                              refresh();
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </SortableItem>
            );
          })}
        </SortableList>
      )}
    </>
  );
}
