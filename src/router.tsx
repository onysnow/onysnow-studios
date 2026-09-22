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
