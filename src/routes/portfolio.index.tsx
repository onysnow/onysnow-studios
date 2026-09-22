import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { JustifiedGallery } from "@/components/site/JustifiedGallery";
import { PortfolioFilterBar } from "@/components/site/PortfolioFilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, galleryPhotosQuery } from "@/lib/content";
import { photoUrl } from "@/lib/photo-url";

type PortfolioSearch = { category?: string };

export const Route = createFileRoute("/portfolio/")({
  validateSearch: (search: Record<string, unknown>): PortfolioSearch => {
    const raw = search["category"];
    return typeof raw === "string" && raw.length > 0 ? { category: raw } : {};
  },
  loaderDeps: ({ search }: { search: PortfolioSearch }) => ({ category: search.category }),
  // Loaded server-side so the gallery is indexable and the first row is in HTML.
  loader: async ({ context: { queryClient }, deps }) => {
    const cats = await queryClient.ensureQueryData(categoriesQuery);
    const active = cats.find((c) => c.slug === deps.category);
    const photos = await queryClient.ensureQueryData(galleryPhotosQuery(active?.id ?? null));
    return { ogImage: photoUrl(photos[0]?.storage_path), category: active?.name ?? null };
  },
  head: ({ loaderData }) => ({
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
      ...(loaderData?.ogImage ? [{ property: "og:image", content: loaderData.ogImage }] : []),
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
      {/*
        The page's real heading, carried only for screen readers and crawlers.

        The design deliberately has no title block here — the photographs start
        directly under the bars and nothing is allowed to eat that space. But a
        page with no h1 at all leaves assistive tech with nothing to announce and
        search engines with nothing to index, so the heading exists without
        occupying a pixel. It tracks the active filter.
      */}
      <h1 className="sr-only">
        {active?.name ? `${active.name} photography` : "Portfolio"} — OnySnow Studios
      </h1>

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
