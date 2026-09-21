import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Category pages are kept as deep links — /portfolio/cosplay still works and still
 * carries its own metadata — but they now land on the single mixed gallery with
 * that collection's filter applied, rather than on a separate page.
 */
export const Route = createFileRoute("/portfolio/$category")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portfolio",
      search: { category: params.category },
      replace: true,
    });
  },
});
