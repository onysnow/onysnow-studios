import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Gallery } from "@/components/site/Gallery";
import { PageIntro } from "@/components/site/PageIntro";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, photosFor, photosQuery } from "@/lib/content";

function titleCase(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export const Route = createFileRoute("/portfolio/$category")({
  head: ({ params }) => {
    const name = titleCase(params.category);
    return { meta: [
      { title: `${name} Photography — OnySnow Studios` },
      { name: "description", content: `${name} photography by OnySnow Studios.` },
      { property: "og:title", content: `${name} Photography — OnySnow Studios` },
      { property: "og:description", content: `${name} photography by OnySnow Studios.` },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category: slug } = Route.useParams();
  const { data: categories, isPending: catsPending } = useQuery(categoriesQuery);
  const { data: photos, isPending: photosPending } = useQuery(photosQuery);
  const category = categories?.find((c) => c.slug === slug);
  const images = photosFor(photos, category?.id);
  const missing = !catsPending && categories !== undefined && !category;

  return <>
    <PageIntro loading={catsPending} eyebrow="Portfolio collection" title={category?.name ?? titleCase(slug)} body={category?.description ?? ""} />
    <section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto max-w-screen-2xl">
      <Link to="/portfolio" className="mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><ArrowLeft className="size-4"/>All collections</Link>
      {missing ? <p className="text-muted-foreground">This collection isn’t available right now.</p>
        : photosPending ? <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="mb-4 aspect-[3/2] w-full break-inside-avoid"/>)}</div>
        : images.length === 0 ? <p className="text-muted-foreground">Photographs for this collection are coming soon.</p>
        : <Gallery images={images} />}
    </div></section>
  </>;
}
