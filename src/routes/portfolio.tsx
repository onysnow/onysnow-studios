import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Img } from "@/components/site/Img";
import { coverPhotosQuery } from "@/lib/content";

export const Route = createFileRoute("/portfolio")({
  // The backdrop is what makes the frosted bars read as glass, so it needs to be
  // in the first paint rather than appearing a beat after the gallery.
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(coverPhotosQuery),
  component: PortfolioLayout,
});

function PortfolioLayout() {
  const { data: photos } = useQuery(coverPhotosQuery);
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
        <Img
          image={backdrop}
          eager
          className="h-full w-full"
          sizes="100vw"
          imgClassName="object-cover"
        />
        {/* Light where the two bars sit, solid by the time the first row of
            photographs begins, so the gallery still starts on clean background. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background" />
      </div>

      {/* pt-16 clears the fixed header; the filter bar then sits directly beneath
          it and the photographs begin immediately — no title block eating the fold. */}
      <div className="relative pt-16">
        <Outlet />
      </div>
    </div>
  );
}
