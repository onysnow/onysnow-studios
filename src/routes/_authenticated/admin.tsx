import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera, Code2, FileText, Folder, Images, LayoutDashboard, LogOut, MessageSquareQuote,
  Inbox, Loader2, Settings, Sparkles, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStatus } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof Images; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/photos", label: "Photos", icon: Images },
  { to: "/admin/categories", label: "Categories", icon: Folder },
  { to: "/admin/services", label: "Services", icon: Sparkles },
  { to: "/admin/testimonials", label: "Testimonials", icon: MessageSquareQuote },
  { to: "/admin/pages", label: "Page copy", icon: FileText },
  { to: "/admin/inquiries", label: "Inquiries", icon: Inbox },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/advanced", label: "Advanced", icon: Code2 },
];

function AdminLayout() {
  const { data, isLoading } = useAdminStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }

  if (!data?.isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center px-5 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-2xl">Not authorised</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            This account is signed in but has not been granted studio access. Only accounts explicitly
            granted access can manage the site.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{data?.user?.email}</p>
          <Button variant="outline" className="mt-8" onClick={signOut}>Sign out</Button>
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <Camera className="size-5 text-primary" />
            <span className="font-display text-xl">Studio</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => {
                  const active = item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link to={item.to}><item.icon /><span>{item.label}</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild><Link to="/"><ExternalLink /><span>View site</span></Link></SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut}><LogOut /><span>Sign out</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
          <p className="text-sm text-muted-foreground">Signed in as {data.user?.email}</p>
        </header>
        <div className="p-5 sm:p-8"><Outlet /></div>
      </SidebarInset>
    </SidebarProvider>
  );
}
