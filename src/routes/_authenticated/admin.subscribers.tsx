import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { adminSubscribersQuery } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/subscribers")({
  component: SubscribersPage,
});

function SubscribersPage() {
  const subscribers = useQuery(adminSubscribersQuery);
  const refresh = useContentRefresh();
  const list = subscribers.data ?? [];

  /** Export as CSV so the list can move into whatever email tool gets chosen. */
  function exportCsv() {
    const rows = [
      ["email", "source", "joined"],
      ...list.map((s) => [s.email, s.source, s.created_at]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string) {
    await supabase.from("subscribers").delete().eq("id", id);
    refresh();
  }

  return (
    <>
      <AdminHeading
        title="Subscribers"
        description="People who asked to hear when there's new work."
        action={
          list.length > 0 ? (
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Export CSV
            </Button>
          ) : null
        }
      />

      {subscribers.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No subscribers yet. The form sits at the foot of the journal and every post.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Came from</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.email}</TableCell>
                  <TableCell className="text-muted-foreground">{s.source || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${s.email}`}
                      onClick={() => remove(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
