import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { Container, Section } from "./layout";
import { Button } from "@/components/ui/button";

/**
 * The boundary every route falls back to.
 *
 * Content is fetched in loaders now, so a failure is a server error rather than
 * a page that silently renders empty. This says so plainly and offers a way out,
 * instead of leaving a visitor on a blank screen.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  // Never show a stack trace to a visitor; it's noise to them and detail to
  // anyone poking at the site.
  const detail = import.meta.env.DEV && error instanceof Error ? error.message : null;

  return (
    <Section size="lg" className="pt-32 text-center">
      <Container width="content">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-5 font-display text-3xl lg:text-4xl">This page didn’t load.</h1>
        <p className="mx-auto mt-6 max-w-lg leading-8 text-muted-foreground">
          That’s on the site, not on you. Try again in a moment — and if it keeps happening, the
          contact page still works.
        </p>
        {detail ? (
          <pre className="mx-auto mt-8 max-w-xl overflow-x-auto rounded-md border border-border bg-card p-4 text-left text-xs text-muted-foreground">
            {detail}
          </pre>
        ) : null}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button variant="cinematic" size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
