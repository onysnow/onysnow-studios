import { useQuery } from "@tanstack/react-query";
import { Reveal } from "./Reveal";
import { Img } from "./Img";
import { Container, Section } from "./layout";
import { Skeleton } from "@/components/ui/skeleton";
import { photosQuery } from "@/lib/content";

/**
 * The standard page header.
 *
 * It carries a photographic band behind it deliberately: the header and filter
 * bar are frosted glass, and frosted glass only reads as glass when there is
 * something behind it to blur. Without this, inner pages made the nav look like
 * a plain translucent slab.
 */
export function PageIntro({
  eyebrow,
  title,
  body,
  loading = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  loading?: boolean;
}) {
  const { data: photos } = useQuery(photosQuery);
  // Any photograph will do — it sits well behind the copy, heavily dimmed.
  const backdrop = photos?.find((p) => p.width > p.height) ?? photos?.[0];

  return (
    <div className="relative isolate">
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <Img image={backdrop} eager className="h-full w-full" sizes="100vw" imgClassName="object-cover" />
        {/* Heavy scrim: the photograph is there for the blur to catch, not to be read. */}
        <div className="absolute inset-0 bg-background/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      <Section size="none" className="pt-24 pb-8 lg:pt-28 lg:pb-10">
        <Container>
          <Reveal>
            <p className="eyebrow">{eyebrow}</p>
            {loading ? (
              <div className="mt-5 max-w-4xl space-y-3">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-2/3" />
              </div>
            ) : (
              <h1 className="mt-5 max-w-4xl font-display text-[2.25rem] leading-[.98] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
            )}
            {loading ? (
              <Skeleton className="mt-7 h-10 max-w-2xl" />
            ) : body ? (
              <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{body}</p>
            ) : null}
          </Reveal>
        </Container>
      </Section>
    </div>
  );
}
