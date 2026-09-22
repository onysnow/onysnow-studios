import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { JustifiedGallery } from "@/components/site/JustifiedGallery";
import { PortfolioFilterBar } from "@/components/site/PortfolioFilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, galleryPhotosQuery } from "@/lib/content";

type PortfolioSearch = { category?: string };

export const Route = createFileRoute("/portfolio/")({
  validateSearch: (search: Record<string, unknown>): PortfolioSearch => {
    const raw = search["category"];
    return typeof raw === "string" && raw.length > 0 ? { category: raw } : {};
  },
  head: () => ({
    meta: [
      { title: "Portfolio — OnySnow Studios" },
      {
        name: "description",
        content:
          "Candid, events, portraits, fine art, cosplay and street photography by OnySnow Studios.",
      },
      { property: "og:title", content: "Portfolio — OnySnow Studios" },
      { property: "og:description", content: "Six disciplines, one cinematic point of view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Portfolio,
});

function Portfolio() {
  const { category: activeSlug } = Route.useSearch();
  const { data: categories, isPending: catsPending } = useQuery(categoriesQuery);
  const cats = categories ?? [];
  const active = cats.find((c) => c.slug === activeSlug);

  // Filtering happens in Postgres and the page is bounded, so a large archive
  // never lands on the client in one go.
  const { data: photos, isPending: photosPending } = useQuery(
    galleryPhotosQuery(active?.id ?? null),
  );
  const images = photos ?? [];

  return (
    <>
      <PortfolioFilterBar categories={cats} active={active?.slug} />

      <section className="px-2 pb-24 pt-2 sm:px-3 lg:px-4">
        <div className="mx-auto max-w-screen-2xl">
          {catsPending || photosPending ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/2] w-full" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <p className="py-24 text-center text-sm text-muted-foreground">
              {active
                ? `Photographs for ${active.name} are coming soon.`
                : "Photographs are coming soon."}
            </p>
          ) : (
            <JustifiedGallery images={images} />
          )}
        </div>
      </section>
    </>
  );
}
