import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/site/PageIntro";
import { Card, CardBody, CardFooter, Container, Grid, Section } from "@/components/site/layout";
import { copy, pageCopyQuery, servicesQuery } from "@/lib/content";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services & Pricing — OnySnow Studios" },
      {
        name: "description",
        content:
          "Photography services for candid sessions, events, portraits, fine art, cosplay, and street stories.",
      },
      { property: "og:title", content: "Services & Pricing — OnySnow Studios" },
      { property: "og:description", content: "Choose the photography experience that fits your story." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Services,
});

function Services() {
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("services"));
  const { data: services, isPending } = useQuery(servicesQuery);
  const list = services ?? [];

  return (
    <>
      <PageIntro
        loading={textPending}
        eyebrow={copy(text, "intro_eyebrow", "Services & pricing")}
        title={copy(text, "intro_title", "Choose the shape. Keep the feeling.")}
        body={copy(text, "intro_body", "")}
      />

      <Section size="none" className="pb-20 lg:pb-28">
        <Container>
          {/* Grid stretches its children and Card pins its own footer, so price
              and button align across the row however long each summary runs. */}
          <Grid cols={3} gap="hairline">
            {isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-background p-7 sm:p-9">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="mt-6 h-20 w-full" />
                  </div>
                ))
              : list.map((service, i) => (
                  <Card key={service.id} className="p-7 sm:p-9">
                    <CardBody>
                      <p className="eyebrow">0{i + 1}</p>
                      <h2 className="mt-5 font-display text-2xl">{service.name}</h2>
                      <p className="mt-4 leading-7 text-muted-foreground">{service.summary}</p>
                      <ul className="mt-7 space-y-3 text-sm">
                        {(service.included ?? []).map((item) => (
                          <li key={item} className="flex gap-3">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                    <CardFooter className="pt-9">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Turnaround · {service.turnaround}
                      </p>
                      <p className="mt-2 font-display text-lg">{service.price_display}</p>
                      <Button asChild variant="outline" size="lg" className="mt-5 w-full">
                        <Link to="/book">Book this</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
          </Grid>
        </Container>
      </Section>
    </>
  );
}
