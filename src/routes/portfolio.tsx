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
    /*
     * The whole page is one scene (data-photo): a photograph held still
     * behind it, and the gallery on one long pane of glass over it (Ony,
     * 2026-10-02: "one long glass pane underneath the tiling photos"). The
     * photograph stays put as the glass slides over it, as a window does
     * over a view, so the frost always has a picture to blur all the way
     * down, and the glass's light and refraction take it as the pane's
     * backdrop (effects/scene backdropOf).
     */
    <div data-photo className="relative">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <Img
          image={backdrop}
          eager
          className="h-full w-full"
          sizes="100vw"
          imgClassName="object-cover"
        />
      </div>

      {/* pt-16 clears the fixed header; the filter bar then sits directly beneath
          it and the photographs begin immediately — no title block eating the fold. */}
      <div className="relative z-[1] pt-16">
        <Outlet />
      </div>
    </div>
  );
}
