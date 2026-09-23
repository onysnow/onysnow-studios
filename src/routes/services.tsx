import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Img } from "@/components/site/Img";
import { PageIntro } from "@/components/site/PageIntro";
import { Reveal } from "@/components/site/Reveal";
import { ScrambleText } from "@/components/site/ScrambleText";
import { Container, Section } from "@/components/site/layout";
import {
  categoriesQuery,
  copy,
  coverFor,
  coverPhotosQuery,
  pageCopyQuery,
  servicesQuery,
  settingsQuery,
  type Service,
} from "@/lib/content";

export const Route = createFileRoute("/services")({
  // Server-rendered so the page is indexable rather than a skeleton.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(servicesQuery),
      queryClient.ensureQueryData(categoriesQuery),
      queryClient.ensureQueryData(coverPhotosQuery),
      queryClient.ensureQueryData(settingsQuery),
      queryClient.ensureQueryData(pageCopyQuery("services")),
    ]),
  head: () => ({
    meta: [
      { title: "Services — OnySnow Studios" },
      {
        name: "description",
        content:
          "Photography services for candid sessions, events, portraits, fine art, cosplay, and street stories.",
      },
      { property: "og:title", content: "Services — OnySnow Studios" },
      {
        property: "og:description",
        content: "Six ways of working, and what each one is actually like.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Services,
});

/**
 * One discipline, as a full-width band.
 *
 * Photograph on one side, words on the other, sides swapping down the page.
 * There is no card here on purpose: a bordered box with a price and a button in
 * it is a pricing tier, and six of them side by side is a comparison table —
 * which is what a platform sells, not what a photographer does. A band gives
 * each discipline a photograph at a size worth looking at and lets the page be
 * read rather than compared.
 */
function ServiceBand({
  service,
  index,
  image,
  showPrice,
}: {
  service: Service;
  index: number;
  image: ReturnType<typeof coverFor>;
  showPrice: boolean;
}) {
  // Every second band mirrors. The photograph always comes first in the DOM, so
  // on a narrow screen each discipline reads picture-then-words regardless.
  const mirrored = index % 2 === 1;

  return (
    <Reveal>
      <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div className={mirrored ? "lg:order-2" : undefined}>
          <Link
            to="/portfolio"
            search={{ category: service.slug }}
            className="group block overflow-hidden"
            tabIndex={-1}
            aria-hidden="true"
          >
            <Img
              image={image}
              className="h-[340px] sm:h-[420px] lg:h-[500px]"
              sizes="(min-width: 1024px) 50vw, 100vw"
              imgClassName="transition-transform duration-[1200ms] ease-out group-hover:scale-105"
            />
          </Link>
        </div>

        <div className={mirrored ? "lg:order-1" : undefined}>
          <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
          <h2 className="mt-4 font-display text-[1.75rem] leading-[1.05] sm:text-3xl lg:text-4xl">
            {service.name}
          </h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">{service.summary}</p>

          {/*
            Set as plain lines separated by hairlines rather than a checklist.
            Ticks turn a description of the work into a feature comparison, and
            invite the reader to scan across disciplines counting them.
          */}
          {(service.included ?? []).length > 0 ? (
            <ul className="mt-7 max-w-md divide-y divide-border border-y border-border">
              {(service.included ?? []).map((item) => (
                <li key={item} className="py-2.5 text-sm text-foreground/75">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {service.turnaround ? <span>Turnaround · {service.turnaround}</span> : null}
            {showPrice && service.price_display ? (
              <span className="text-foreground/85">{service.price_display}</span>
            ) : null}
          </div>

          {/*
            Text links, not filled buttons. A button per discipline reads as
            "choose your plan"; the work is the thing being shown, so the way
            forward is a line of type rather than a call to action six times over.
          */}
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link
              to="/contact"
              className="group inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-xs uppercase tracking-[0.18em] text-primary transition-colors hover:border-primary"
            >
              Enquire about {service.name}
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/portfolio"
              search={{ category: service.slug }}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              See the work
            </Link>
          </div>
        </div>
      </article>
    </Reveal>
  );
}

function BandSkeleton({ mirrored }: { mirrored: boolean }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <Skeleton
        className={`h-[340px] w-full sm:h-[420px] lg:h-[500px] ${mirrored ? "lg:order-2" : ""}`}
      />
      <div className={mirrored ? "lg:order-1" : undefined}>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-5 h-16 w-full max-w-md" />
        <Skeleton className="mt-7 h-28 w-full max-w-md" />
      </div>
    </div>
  );
}

function Services() {
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("services"));
  const { data: services, isPending } = useQuery(servicesQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { data: photos } = useQuery(coverPhotosQuery);
  const { data: settings } = useQuery(settingsQuery);

  const list = services ?? [];
  // Undecided for now, so it's a portal switch rather than a code change.
  /*
   * `!== "false"` rather than `=== "true"`.
   *
   * `site_settings.value` is TEXT NOT NULL DEFAULT '', so a row that exists
   * with a blank value yields "" — which is not nullish, so `?? "true"` never
   * fired and every price vanished from the page with no way to tell that
   * from the switch being deliberately off.
   */
  const showPrice = (settings?.["services_show_prices"] ?? "").toLowerCase() !== "false";

  return (
    <>
      <PageIntro
        loading={textPending}
        eyebrow={copy(text, "intro_eyebrow", "Services")}
        title={copy(text, "intro_title", "Six ways of working.")}
        body={copy(
          text,
          "intro_body",
          "Every one of these starts the same way — a conversation about what the day actually is. The differences are in what happens after that.",
        )}
      />

      <Section size="none" className="pb-24 lg:pb-32">
        <Container>
          <div className="space-y-16 lg:space-y-24">
            {isPending
              ? Array.from({ length: 3 }).map((_, i) => (
                  <BandSkeleton key={i} mirrored={i % 2 === 1} />
                ))
              : list.map((service, i) => (
                  <ServiceBand
                    key={service.id}
                    service={service}
                    index={i}
                    image={coverFor(
                      photos,
                      (categories ?? []).find((c) => c.slug === service.slug),
                    )}
                    showPrice={showPrice}
                  />
                ))}
          </div>
        </Container>
      </Section>

      {/* One way forward at the end of the page, rather than six on the way down. */}
      <Section size="base" tone="bordered">
        <Container width="content">
          <div className="text-center">
            <h2 className="font-display text-2xl lg:text-3xl">
              <ScrambleText text={copy(text, "cta_title", "Not sure which of these it is?")} />
            </h2>
            <p className="mx-auto mt-5 max-w-lg leading-7 text-muted-foreground">
              {copy(
                text,
                "cta_body",
                "Most shoots don’t land neatly in one. Tell me what’s happening and I’ll tell you how I’d photograph it.",
              )}
            </p>
            <Link
              to="/contact"
              className="mt-8 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-xs uppercase tracking-[0.18em] text-primary transition-colors hover:border-primary"
            >
              Start a conversation
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}
