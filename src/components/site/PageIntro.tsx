import { Reveal } from "./Reveal";
import { Container, Section } from "./layout";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The standard page header. `pt-30` clears the fixed header; everything else
 * comes from the rhythm tokens so page titles sit at a consistent height.
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
  return (
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
  );
}
