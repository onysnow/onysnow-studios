import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ParallaxScene } from "@/components/site/ParallaxScene";
import { PostBlocks } from "@/components/site/PostBlocks";
import { SubscribeForm } from "@/components/site/SubscribeForm";
import { Container, Section } from "@/components/site/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { photoById, photosByIdsQuery, postQuery, type PostBlock } from "@/lib/content";
import { photoUrl } from "@/lib/photo-url";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const Route = createFileRoute("/journal/$slug")({
  /**
   * Loaded on the server so the post's own title, excerpt and cover photograph
   * are in the HTML — which is what makes a shared link worth clicking and what
   * lets the piece be indexed at all.
   */
  loader: async ({ context: { queryClient }, params }) => {
    const post = await queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) return { post: null, ogImage: "" };

    const referenced = ((post.blocks ?? []) as PostBlock[]).flatMap((b) =>
      b.type === "full_bleed"
        ? [b.photo_id]
        : b.type === "image_pair" || b.type === "gallery"
          ? b.photo_ids
          : [],
    );
    const photos = await queryClient.ensureQueryData(
      photosByIdsQuery([...referenced, post.cover_photo_id ?? ""]),
    );
    const cover = photos.find((p) => p.id === post.cover_photo_id);
    return { post, ogImage: photoUrl(cover?.storage_path) };
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.post?.title ?? titleFromSlug(params.slug);
    const description = loaderData?.post?.excerpt || `${title}, from the OnySnow Studios journal.`;
    return {
      meta: [
        { title: `${title} — OnySnow Studios` },
        { name: "description", content: description },
        { property: "og:title", content: `${title} — OnySnow Studios` },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        ...(loaderData?.ogImage ? [{ property: "og:image", content: loaderData.ogImage }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PostPage,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function PostPage() {
  const { slug } = Route.useParams();
  const { data: post, isPending } = useQuery(postQuery(slug));
  // Only the photographs this post actually references — the renderer used to
  // scan the whole archive to resolve each block.
  const referenced = ((post?.blocks ?? []) as PostBlock[]).flatMap((b) =>
    b.type === "full_bleed"
      ? [b.photo_id]
      : b.type === "image_pair"
        ? b.photo_ids
        : b.type === "gallery"
          ? b.photo_ids
          : [],
  );
  const { data: photos } = useQuery(photosByIdsQuery([...referenced, post?.cover_photo_id ?? ""]));

  if (isPending) {
    return (
      <Section size="lg" className="pt-32">
        <Container width="prose">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="mt-6 h-64 w-full" />
        </Container>
      </Section>
    );
  }

  if (!post) {
    return (
      <Section size="lg" className="pt-32 text-center">
        <Container width="content">
          <h1 className="font-display text-3xl">That piece isn’t here.</h1>
          <Link to="/journal" className="mt-6 inline-block text-primary">
            Back to the journal
          </Link>
        </Container>
      </Section>
    );
  }

  const cover = photoById(photos, post.cover_photo_id);

  return (
    <article>
      {/* Full-bleed opener with the title over it — the magazine spread starts here. */}
      <ParallaxScene image={cover} depth="subtle" scrim="bottom" height="min-h-[78svh]">
        <Section size="base">
          <Container width="content">
            <p className="text-xs uppercase tracking-widest text-primary">
              {formatDate(post.published_at)} · {post.reading_minutes} min read
            </p>
            <h1 className="mt-4 font-display text-[2.25rem] leading-[.98] sm:text-5xl lg:text-6xl">
              {post.title}
            </h1>
            {post.excerpt ? (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-foreground/80">{post.excerpt}</p>
            ) : null}
          </Container>
        </Section>
      </ParallaxScene>

      <PostBlocks blocks={post.blocks ?? []} photos={photos} />

      <Section size="base" tone="bordered">
        <Container>
          <SubscribeForm source={`post:${post.slug}`} variant="banner" />
        </Container>
      </Section>

      <Section size="sm">
        <Container>
          <Link
            to="/journal"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All writing
          </Link>
        </Container>
      </Section>
    </article>
  );
}
