import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { SortableItem, SortableList } from "@/components/admin/SortableList";
import { adminServicesQuery, deleteRow, insertRow, saveOrder, updateRow } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import type { Service } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/services")({ component: ServicesPage });

function ServicesPage() {
  const services = useQuery(adminServicesQuery);
  const refresh = useContentRefresh();
  const [order, setOrder] = useState<string[] | null>(null);

  const list = useMemo(() => {
    const rows = services.data ?? [];
    if (!order) return rows;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...rows].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [services.data, order]);

  async function patch(id: string, values: Partial<Service>) {
    try { await updateRow("services", id, values); refresh(); }
    catch (error) { toast.error("Could not save", { description: error instanceof Error ? error.message : undefined }); }
  }

  async function add() {
    const n = (services.data ?? []).length + 1;
    try {
      await insertRow("services", {
        slug: `new-service-${n}`, name: "New service", summary: "", included: [],
        turnaround: "", price_display: "", sort_order: n, published: false,
      });
      refresh();
    } catch (error) { toast.error("Could not add the service", { description: error instanceof Error ? error.message : undefined }); }
  }

  async function reorder(ids: string[]) {
    setOrder(ids);
    try { await saveOrder("services", ids); refresh(); } catch { toast.error("Could not save the new order"); }
  }

  return (
    <>
      <AdminHeading
        title="Services"
        description="What you offer and what it costs. One line per item in “what's included”."
        action={<Button variant="cinematic" onClick={add}><Plus /> Add service</Button>}
      />

      {services.isLoading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full" />)}</div>
      ) : (
        <SortableList ids={list.map((s) => s.id)} onReorder={reorder} className="space-y-4">
          {list.map((s) => (
            <SortableItem key={s.id} id={s.id}>
              <div className="grid gap-4 rounded-lg border border-border bg-card p-4 pl-12 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && patch(s.id, { name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Price shown</Label>
                  <Input defaultValue={s.price_display} onBlur={(e) => e.target.value !== s.price_display && patch(s.id, { price_display: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Summary</Label>
                  <Textarea defaultValue={s.summary} rows={2} onBlur={(e) => e.target.value !== s.summary && patch(s.id, { summary: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>What's included — one per line</Label>
                  <Textarea
                    defaultValue={(s.included ?? []).join("\n")}
                    rows={4}
                    onBlur={(e) => {
                      const next = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                      if (next.join("\n") !== (s.included ?? []).join("\n")) patch(s.id, { included: next });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Turnaround</Label>
                  <Input defaultValue={s.turnaround} onBlur={(e) => e.target.value !== s.turnaround && patch(s.id, { turnaround: e.target.value })} />
                </div>
                <div className="flex items-end justify-between gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={s.published} onCheckedChange={(v) => patch(s.id, { published: v })} /> Published
                  </label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Delete service"><Trash2 className="size-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{s.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => { await deleteRow("services", s.id); refresh(); }}>Delete</AlertDialogAction>
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
