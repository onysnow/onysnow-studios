import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, Mail, MailOpen } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { adminInquiriesQuery } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { useContentRefresh } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Inquiry } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/admin/inquiries")({ component: InquiriesPage });

function InquiriesPage() {
  const inquiries = useQuery(adminInquiriesQuery);
  const refresh = useContentRefresh();
  const [tab, setTab] = useState("open");
  const [open, setOpen] = useState<Inquiry | null>(null);

  const rows = (inquiries.data ?? []).filter((i) => (tab === "archived" ? i.status === "archived" : i.status !== "archived"));

  async function setStatus(id: string, status: Inquiry["status"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("inquiries").update({ status }).eq("id", id);
    if (error) toast.error("Could not update", { description: error.message });
    else refresh();
  }

  return (
    <>
      <AdminHeading title="Inquiries" description="Messages sent through the contact form." />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="archived">Archived</TabsTrigger></TabsList>
      </Tabs>

      {inquiries.isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead>
                <TableHead>Looking for</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => { setOpen(i); if (i.status === "new") void setStatus(i.id, "read"); }}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>{i.email}</TableCell>
                  <TableCell>{i.kind}</TableCell>
                  <TableCell><Badge variant={i.status === "new" ? "default" : "secondary"}>{i.status}</Badge></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" aria-label={i.status === "new" ? "Mark as read" : "Mark as unread"}
                      onClick={() => setStatus(i.id, i.status === "new" ? "read" : "new")}>
                      {i.status === "new" ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={i.status === "archived" ? "Restore" : "Archive"}
                      onClick={() => setStatus(i.id, i.status === "archived" ? "read" : "archived")}>
                      <Archive className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{open?.name}</DialogTitle>
            <DialogDescription>{open?.email} · {open?.kind}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{open?.message}</p>
          {open ? <Button asChild variant="cinematic" className="mt-2 w-fit"><a href={`mailto:${open.email}`}>Reply by email</a></Button> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
