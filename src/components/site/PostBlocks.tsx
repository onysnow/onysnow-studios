import { Img } from "./Img";
import { RichText } from "./RichText";
import { JustifiedGallery } from "./JustifiedGallery";
import { Container, Section } from "./layout";
import { Reveal } from "./Reveal";
import { photoById, type Photo, type PostBlock } from "@/lib/content";

/**
 * Renders a post's blocks as a magazine spread.
 *
 * Every block composes existing primitives — the editorial feel comes from
 * arrangement and rhythm, not from bespoke CSS per post.
 */
export function PostBlocks({
  blocks,
  photos,
}: {
  blocks: PostBlock[];
  photos: Photo[] | undefined;
}) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} photos={photos} index={i} />
      ))}
    </>
  );
}

function Caption({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return <p className="mt-3 text-sm text-muted-foreground">{text}</p>;
}

function Block({
  block,
  photos,
  index,
}: {
  block: PostBlock;
  photos: Photo[] | undefined;
  index: number;
}) {
  switch (block.type) {
    case "heading":
      return (
        <Section size="sm">
          <Container width="prose">
            <h2 className="font-display text-2xl lg:text-3xl">{block.text}</h2>
          </Container>
        </Section>
      );

    case "prose":
      return (
        <Section size="sm">
          <Container width="prose">
            <RichText
              html={block.html}
              className="space-y-5 text-lg leading-8 text-foreground/85"
            />
          </Container>
        </Section>
      );

    case "pull_quote":
      return (
        <Section size="base">
          <Container width="content">
            <Reveal>
              {/* Offset and rule give the quote a different optical weight to body copy. */}
              <blockquote className="border-l-2 border-primary pl-6 lg:pl-10">
                <p className="font-display text-2xl leading-tight lg:text-4xl">{block.text}</p>
                {block.attribution ? (
                  <footer className="mt-5 text-xs uppercase tracking-widest text-muted-foreground">
                    {block.attribution}
                  </footer>
                ) : null}
              </blockquote>
            </Reveal>
          </Container>
        </Section>
      );

    case "full_bleed": {
      const photo = photoById(photos, block.photo_id);
      if (!photo) return null;
      return (
        <Section size="sm" bleed>
          <Reveal>
            <Img image={photo} sizes="100vw" className="w-full" />
            {block.caption ? (
              <Container width="prose" className="px-5 sm:px-8 lg:px-12">
                <Caption text={block.caption} />
              </Container>
            ) : null}
          </Reveal>
        </Section>
      );
    }

    case "image_pair": {
      const [a, b] = block.photo_ids;
      const first = photoById(photos, a);
      const second = photoById(photos, b);
      if (!first && !second) return null;
      // Vertical offset on alternating pairs keeps the page from feeling gridded.
      const flip = index % 2 === 1;
      return (
        <Section size="base">
          <Container>
            <Reveal className="grid gap-5 md:grid-cols-2 md:items-start">
              <div className={flip ? "md:mt-16" : ""}>
                {first ? <Img image={first} sizes="(min-width: 768px) 50vw, 100vw" /> : null}
              </div>
              <div className={flip ? "" : "md:mt-16"}>
                {second ? <Img image={second} sizes="(min-width: 768px) 50vw, 100vw" /> : null}
              </div>
            </Reveal>
            <Caption text={block.caption} />
          </Container>
        </Section>
      );
    }

    case "gallery": {
      const set = block.photo_ids
        .map((id) => photoById(photos, id))
        .filter((p): p is Photo => Boolean(p));
      if (set.length === 0) return null;
      return (
        <Section size="base">
          <Container>
            <JustifiedGallery images={set} />
          </Container>
        </Section>
      );
    }

    default:
      return null;
  }
}
