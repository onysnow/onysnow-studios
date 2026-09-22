import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageIntro } from "@/components/site/PageIntro";
import { RichText } from "@/components/site/RichText";
import { copy, pageCopyQuery } from "@/lib/content";

export const Route = createFileRoute("/terms")({
  // Server-rendered so the page is indexable rather than a skeleton.
  loader: ({ context: { queryClient } }) =>
    Promise.all([queryClient.ensureQueryData(pageCopyQuery("terms"))]),
  head: () => ({
    meta: [
      { title: "Terms — OnySnow Studios" },
      { name: "description", content: "Website terms for OnySnow Studios." },
      { property: "og:title", content: "Terms — OnySnow Studios" },
      { property: "og:description", content: "Terms for using the OnySnow Studios website." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  const { data: text, isPending } = useQuery(pageCopyQuery("terms"));
  return (
    <>
      <PageIntro
        loading={isPending}
        eyebrow="Legal"
        title={copy(text, "intro_title", "Terms")}
        body={copy(text, "intro_body", "")}
      />
      <article className="mx-auto max-w-3xl px-5 pb-28 sm:px-8">
        <RichText html={copy(text, "body", "")} className="leading-8 text-muted-foreground" />
      </article>
    </>
  );
}
