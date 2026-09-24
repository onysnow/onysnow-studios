import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { RouteError } from "./components/site/RouteError";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Route loaders prime the cache on the server; without a stale window the
        // client would immediately refetch everything it was just handed.
        staleTime: 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,

    /*
     * Fetch the next route before it is asked for.
     *
     * Every route is its own chunk -- that is what keeps the homepage from
     * carrying the admin's 448KB of editor -- but nothing was prefetching
     * them, so each first visit to a page paid for its JS and its data in
     * series, after the click. That is the pause that makes a code-split app
     * feel worse than an old server-rendered site rather than better.
     *
     * "intent" means hover, focus, or touch-start: by the time a click lands,
     * the chunk and its loader data are usually already in. It costs nothing
     * for routes nobody points at, which is why this is better than loading
     * everything up front -- that would just move the whole wait to the first
     * page and make the site slower to open.
     */
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Loaders run on the server, so a content-fetch failure surfaces as a route
    // error rather than an empty client state. Every route gets a boundary.
    defaultErrorComponent: RouteError,
  });

  // Dehydrates the query cache into the SSR payload and rehydrates it on the
  // client, so server-rendered content isn't thrown away and refetched.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
