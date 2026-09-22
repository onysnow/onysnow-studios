import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Img } from "@/components/site/Img";
import { PageIntro } from "@/components/site/PageIntro";
import { Reveal } from "@/components/site/Reveal";
import { SubscribeForm } from "@/components/site/SubscribeForm";
import { Card, CardBody, CardFooter, Container, Grid, Section } from "@/components/site/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { copy, pageCopyQuery, photoById, coverPhotosQuery, postsQuery } from "@/lib/content";
import { photoUrl } from "@/lib/photo-url";

export const Route = createFileRoute("/journal/")({
  // Server-rendered: a journal crawlers index as an empty page isn't a journal.
  loader: async ({ context: { queryClient } }) => {
    const [posts, photos] = await Promise.all([
      queryClient.ensureQueryData(postsQuery),
      queryClient.ensureQueryData(coverPhotosQuery),
      queryClient.ensureQueryData(pageCopyQuery("journal")),
    ]);
    const cover = photoById(photos, posts[0]?.cover_photo_id);
    return { ogImage: photoUrl(cover?.storage_path) };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Journal — OnySnow Studios" },
      {
        name: "description",
        content: "Photographs and the stories behind them, from OnySnow Studios.",
      },
      { property: "og:title", content: "Journal — OnySnow Studios" },
      { property: "og:description", content: "Photographs and the stories behind them." },
      { property: "og:type", content: "website" },
      ...(loaderData?.ogImage ? [{ property: "og:image", content: loaderData.ogImage }] : []),
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Journal,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Journal() {
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("journal"));
  const { data: posts, isPending } = useQuery(postsQuery);
  const { data: photos } = useQuery(coverPhotosQuery);
  const list = posts ?? [];

  return (
    <>
      <PageIntro
        loading={textPending}
        eyebrow={copy(text, "intro_eyebrow", "Journal")}
        title={copy(text, "intro_title", "Notes from behind the camera.")}
        body={copy(text, "intro_body", "")}
      />

      <Section size="none" className="pb-20 lg:pb-28">
        <Container>
          {isPending ? (
            <Grid cols={3}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/2] w-full" />
              ))}
            </Grid>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The first piece is being written. Subscribe below and it’ll land in your inbox.
            </p>
          ) : (
            <Grid cols={3}>
              {list.map((post) => (
                <Reveal key={post.id}>
                  <Link
                    to="/journal/$slug"
                    params={{ slug: post.slug }}
                    className="group block h-full"
                  >
                    <Card>
                      <Img
                        image={photoById(photos, post.cover_photo_id)}
                        className="aspect-[3/2]"
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        imgClassName="transition-transform duration-700 group-hover:scale-105"
                      />
                      <CardBody className="pt-5">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {formatDate(post.published_at)} · {post.reading_minutes} min
                        </p>
                        <h2 className="mt-3 font-display text-xl transition-colors group-hover:text-primary">
                          {post.title}
                        </h2>
                        <p className="mt-3 leading-7 text-muted-foreground">{post.excerpt}</p>
                      </CardBody>
                      <CardFooter className="pt-6">
                        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
                          Read <ArrowUpRight className="size-4" />
                        </span>
                      </CardFooter>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </Grid>
          )}
        </Container>
      </Section>

      <Section size="base" tone="bordered">
        <Container>
          <SubscribeForm source="journal-index" variant="banner" />
        </Container>
      </Section>
    </>
  );
}
