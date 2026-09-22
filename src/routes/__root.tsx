import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { CustomCss } from "@/components/site/CustomCss";

function NotFoundComponent() { return <main className="grid min-h-screen place-items-center px-5 text-center"><div><p className="eyebrow">404</p><h1 className="mt-4 font-display text-4xl">This frame is missing.</h1><Link to="/" className="mt-8 inline-block text-primary">Return home</Link></div></main>; }

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { name: "theme-color", content: "#1a1815" }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400&family=Inter+Tight:wght@200;300;400&family=Barlow+Condensed:wght@200;300;400&family=Manrope:wght@400;500;600&display=swap" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) { return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>; }
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { location } = useRouterState({ select: (s) => ({ location: s.location }) });
  const isAdmin = location.pathname.startsWith("/admin") || location.pathname.startsWith("/auth");
  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? <Outlet /> : <>
        <a href="#main-content" className="fixed left-4 top-3 z-50 -translate-y-20 bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0">Skip to content</a>
        <SiteHeader /><main id="main-content"><Outlet /></main><SiteFooter />
      </>}
      <Toaster position="bottom-right" />
      <CustomCss />
    </QueryClientProvider>
  );
}
