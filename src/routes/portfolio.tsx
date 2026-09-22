import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Img } from "@/components/site/Img";
import { photosQuery } from "@/lib/content";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioLayout,
});

function PortfolioLayout() {
  const { data: photos } = useQuery(photosQuery);
  const backdrop = photos?.find((p) => p.width > p.height) ?? photos?.[0];

  return (
    <div className="relative">
      {/*
        A photographic band sitting behind the header and filter bar.

        Both bars are frosted glass, and glass only reads as glass when there's
        something behind it to blur. The gallery itself starts below the bars, so
        without this the top of the page left them looking like flat slabs.
      */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40 overflow-hidden">
        <Img image={backdrop} eager className="h-full w-full" sizes="100vw" imgClassName="object-cover" />
        <div className="absolute inset-0 bg-background/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      {/* pt-16 clears the fixed header; the filter bar then sits directly beneath
          it and the photographs begin immediately — no title block eating the fold. */}
      <div className="relative pt-16">
        <Outlet />
      </div>
    </div>
  );
}
