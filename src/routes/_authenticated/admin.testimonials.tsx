import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { SortableItem, SortableList } from "@/components/admin/SortableList";
import { adminTestimonialsQuery, deleteRow, insertRow, saveOrder, updateRow } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Testimonial } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/admin/testimonials")({
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const testimonials = useQuery(adminTestimonialsQuery);
  const refresh = useContentRefresh();
  const [order, setOrder] = useState<string[] | null>(null);

  const list = useMemo(() => {
    const rows = testimonials.data ?? [];
    if (!order) return rows;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...rows].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [testimonials.data, order]);

  async function patch(id: string, values: Partial<Testimonial>) {
    try {
      await updateRow("testimonials", id, values);
      refresh();
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function add() {
    const n = (testimonials.data ?? []).length + 1;
    try {
      await insertRow("testimonials", {
        quote: "",
        author: "",
        context: "",
        sort_order: n,
        published: false,
      });
      refresh();
    } catch (error) {
      toast.error("Could not add", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function reorder(ids: string[]) {
    setOrder(ids);
    try {
      await saveOrder("testimonials", ids);
      refresh();
    } catch {
      toast.error("Could not save the new order");
    }
  }

  return (
    <>
      <AdminHeading
        title="Testimonials"
        description="Words from the people you have photographed."
        action={
          <Button variant="cinematic" onClick={add}>
            <Plus /> Add testimonial
          </Button>
        }
      />

      {testimonials.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : (
        <SortableList ids={list.map((t) => t.id)} onReorder={reorder} className="space-y-4">
          {list.map((t) => (
            <SortableItem key={t.id} id={t.id}>
              <div className="grid gap-4 rounded-lg border border-border bg-card p-4 pl-12 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Quote</Label>
                  <Textarea
                    defaultValue={t.quote}
                    rows={3}
                    onBlur={(e) =>
                      e.target.value !== t.quote && patch(t.id, { quote: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Who said it</Label>
                  <Input
                    defaultValue={t.author}
                    onBlur={(e) =>
                      e.target.value !== t.author && patch(t.id, { author: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Context</Label>
                  <Input
                    defaultValue={t.context}
                    onBlur={(e) =>
                      e.target.value !== t.context && patch(t.id, { context: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-end justify-between gap-4 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={t.published}
                      onCheckedChange={(v) => patch(t.id, { published: v })}
                    />{" "}
                    Published
                  </label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Delete testimonial">
                        <Trash2 className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this testimonial?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            await deleteRow("testimonials", t.id);
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
          ))}
        </SortableList>
      )}
    </>
  );
}
