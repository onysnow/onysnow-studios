import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Images, Inbox, Folder, Sparkles, ArrowRight } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { adminCategoriesQuery, adminInquiriesQuery, adminPhotosQuery, adminServicesQuery } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });

function Dashboard() {
  const photos = useQuery(adminPhotosQuery);
  const categories = useQuery(adminCategoriesQuery);
  const services = useQuery(adminServicesQuery);
  const inquiries = useQuery(adminInquiriesQuery);

  const unread = (inquiries.data ?? []).filter((i) => i.status === "new").length;
  const stats = [
    { label: "Photographs", value: photos.data?.length, icon: Images, to: "/admin/photos" },
    { label: "Categories", value: categories.data?.length, icon: Folder, to: "/admin/categories" },
    { label: "Services", value: services.data?.length, icon: Sparkles, to: "/admin/services" },
    { label: "New inquiries", value: unread, icon: Inbox, to: "/admin/inquiries" },
  ];

  return (
    <>
      <AdminHeading title="Dashboard" description="A quick look at the studio site and who has been in touch." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="group">
            <Card className="transition-colors group-hover:border-primary/60">
              <CardContent className="flex items-center gap-4 pt-6">
                <s.icon className="size-5 text-primary" />
                <div>
                  <p className="font-display text-3xl leading-none">{s.value ?? <Skeleton className="inline-block h-7 w-10" />}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-display text-2xl">Recent inquiries</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/admin/inquiries">All inquiries <ArrowRight /></Link></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {inquiries.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />) : null}
          {inquiries.data?.length === 0 ? <p className="text-sm text-muted-foreground">No inquiries yet.</p> : null}
          {(inquiries.data ?? []).slice(0, 5).map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0">
              <div>
                <p className="font-medium">{i.name} <span className="text-muted-foreground">· {i.email}</span></p>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{i.message}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={i.status === "new" ? "default" : "secondary"}>{i.status}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
