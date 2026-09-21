import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioLayout,
});

function PortfolioLayout() {
  // pt-16 clears the fixed header so the filter bar sits directly beneath it and
  // the photographs begin immediately — no large title block eating the fold.
  return (
    <div className="pt-16">
      <Outlet />
    </div>
  );
}
