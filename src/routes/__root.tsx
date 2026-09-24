import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { roomScript } from "@/lib/rooms";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CustomCursor } from "@/components/site/CustomCursor";
import { SiteLoader } from "@/components/site/SiteLoader";
import { ShutterFlash } from "@/components/site/ShutterFlash";
import { GlassFilters } from "@/components/site/GlassFilters";
import { RasterGlass } from "@/components/site/RasterGlass";
import { useRasterGlass } from "@/lib/glass-mode";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { CustomCss } from "@/components/site/CustomCss";
import { categoriesQuery, coverPhotosQuery, settingsQuery } from "@/lib/content";

function NotFoundComponent() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-4 font-display text-4xl">This frame is missing.</h1>
        <Link to="/" className="mt-8 inline-block text-primary">
          Return home
        </Link>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  /**
   * The shell's own data, fetched once for every route.
   *
   * The header, the footer, its nav columns, the eight-photo strip and the
   * custom CSS all need these, and they are on every page — but there was no
   * root loader, so each leaf route had to remember to prime them and several
   * did not. /terms and /privacy missed all three: the header and the entire
   * footer server-rendered empty, then three requests fired on hydration and
   * the footer popped in and reflowed.
   *
   * Priming here means the shell is in the server HTML on every route, and the
   * leaves can stop listing queries that were never really theirs.
   */
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(settingsQuery),
      queryClient.ensureQueryData(categoriesQuery),
      queryClient.ensureQueryData(coverPhotosQuery),
    ]),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1a1815" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400&family=Inter+Tight:wght@200;300;400&family=Barlow+Condensed:wght@200;300;400&family=Manrope:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    /*
      `suppressHydrationWarning` on the <html> element, and it is not papering
      over anything.

      The comment below used to claim that setting a CSS custom property gives
      React "no markup to disagree with at hydration". That is the bug.
      `style.setProperty` on `document.documentElement` MATERIALISES a style
      attribute on <html>, and <html> is rendered by this component, so React
      diffs its attributes and finds one the server never sent. The result was
      a hydration error on every route of the site, and it is the error that
      has been in the dev console this whole time.

      The script has to stay where it is — it picks the room before anything
      paints, and moving it after hydration would paint one room and swap it on
      every load — so the honest fix is to tell React that this element's
      attributes are set outside it.
    */
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/*
          Picks the room the glass reflects, before anything paints. Inline and
          synchronous on purpose, which means it writes a style attribute onto
          <html> before React hydrates — see the note above.
        */}
        <script dangerouslySetInnerHTML={{ __html: roomScript() }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { location } = useRouterState({ select: (s) => ({ location: s.location }) });
  const isAdmin = location.pathname.startsWith("/admin") || location.pathname.startsWith("/auth");
  const raster = useRasterGlass();
  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <Outlet />
      ) : (
        <>
          <a
            href="#main-content"
            className="fixed left-4 top-3 z-50 -translate-y-20 bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main-content">
            <Outlet />
          </main>
          <SiteFooter />
          <CustomCursor />
          <ShutterFlash />
          {/*
            Last in the tree, first on the screen.

            It is `position: fixed` at the top of the stack, so document order
            only decides what paints above what among equals -- putting it here
            keeps it out of the way of the layout while still covering
            everything, including the cursor and the flash overlays, which
            should not be visible over a page that has not been revealed yet.
          */}
          <SiteLoader />
          <GlassFilters />
          {/*
            The rasterised glass, off unless asked for.

            Both systems exist on purpose. The CSS one is what ships; this one
            is the liquidglass pipeline, and until it has been looked at next
            to real glass on a real machine it is a thing to compare against,
            not a replacement. `?glass=raster` turns it on, `?glass=css` turns
            it back off and remembers the choice.
          */}
          <RasterGlass enabled={raster} />
        </>
      )}
      <Toaster position="bottom-right" />
      <CustomCss />
    </QueryClientProvider>
  );
}
