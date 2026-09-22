import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, Camera, Sparkles } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Img } from "@/components/site/Img";
import { Reveal } from "@/components/site/Reveal";
import { ScrambleText } from "@/components/site/ScrambleText";
import { ParallaxScene } from "@/components/site/ParallaxScene";
import { RichText } from "@/components/site/RichText";
import { Card, CardBody, CardFooter, Container, Grid, Section } from "@/components/site/layout";
import { GlassPanel } from "@/components/site/GlassPanel";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "@/components/ui/carousel";
import {
  categoriesQuery,
  copy,
  coverFor,
  pageCopyQuery,
  photosQuery,
  settingsQuery,
  testimonialsQuery,
} from "@/lib/content";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OnySnow Studios — Professional Candid Photography" },
      {
        name: "description",
        content:
          "Cinematic candid, event, portrait, fine art, cosplay, and street photography by Ony Shannon.",
      },
      { property: "og:title", content: "OnySnow Studios — Professional Candid Photography" },
      { property: "og:description", content: "Real moments, cinematic color, and photographs with atmosphere." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.22], [0, 90]);

  const { data: text } = useQuery(pageCopyQuery("home"));
  const { data: categories, isPending: catsPending } = useQuery(categoriesQuery);
  const { data: photos } = useQuery(photosQuery);
  const { data: testimonials } = useQuery(testimonialsQuery);
  const { data: settings } = useQuery(settingsQuery);

  const cats = categories ?? [];
  const hero = photos?.find((p) => p.featured) ?? photos?.[0];
  const philosophyImage = photos?.[2] ?? photos?.[1] ?? hero;
  const quotes = testimonials ?? [];

  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[92svh] overflow-hidden">
        <motion.div className="absolute inset-0 max-md:!translate-y-0" {...(reduced ? {} : { style: { y: heroY } })}>
          <Img
            image={hero}
            eager
            className="h-[105svh] w-full"
            imgClassName="scale-105 object-[72%_center] sm:object-center"
            sizes="100vw"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-background/25" />
        <div className="image-vignette absolute inset-0" />
        <div className="relative flex min-h-[92svh] flex-col justify-end px-5 pb-14 sm:px-8 lg:px-12 lg:pb-20">
          <Container>
            <p className="eyebrow">{copy(text, "hero_eyebrow", "Professional candid photography")}</p>
            <h1 className="mt-4 max-w-4xl font-display text-[2.75rem] leading-[.95] sm:text-6xl lg:text-[4.5rem]">
              <ScrambleText text={copy(text, "hero_title", "Life, exactly as it felt.")} />
            </h1>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild variant="cinematic" size="lg">
                <Link to="/book">
                  Book a session <ArrowRight />
                </Link>
              </Button>
              <Link to="/portfolio" className="text-xs uppercase tracking-widest text-foreground">
                Explore the work
              </Link>
            </div>
          </Container>
        </div>
      </section>

      {/* Intro */}
      <Section size="base">
        <Container>
          <Reveal className="grid gap-10 lg:grid-cols-[.4fr_1fr]">
            <p className="eyebrow">{copy(text, "intro_eyebrow", "What I do")}</p>
            <div>
              <h2 className="max-w-3xl font-display text-2xl leading-tight sm:text-3xl lg:text-4xl">
                {copy(text, "intro_title", "I photograph the part you didn’t know you’d want to remember.")}
              </h2>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
                {copy(text, "intro_body", "")}
              </p>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Disciplines — compact, with a thumbnail so the layout reads at a glance */}
      <Section size="sm" tone="bordered">
        <Container>
          <Reveal>
            <p className="eyebrow">{copy(text, "services_eyebrow", "Ways to work together")}</p>
            <Grid cols={3} gap="base" className="mt-7">
              {catsPending
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[16/7] w-full" />
                  ))
                : cats.map((cat, i) => (
                    <Link
                      to="/portfolio"
                      search={{ category: cat.slug }}
                      key={cat.id}
                      className="group relative block overflow-hidden"
                    >
                      <Img
                        image={coverFor(photos, cat)}
                        className="aspect-[16/7] w-full"
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        imgClassName="transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                        <div>
                          <span className="text-[0.65rem] tracking-widest text-primary">0{i + 1}</span>
                          <h3 className="font-display text-lg leading-tight">{cat.name}</h3>
                        </div>
                        <ArrowDownRight className="size-4 text-foreground/70 transition-transform group-hover:translate-x-1 group-hover:translate-y-1" />
                      </div>
                    </Link>
                  ))}
            </Grid>
          </Reveal>
        </Container>
      </Section>

      {/* Selected work — a horizontal wheel on frosted glass */}
      <Section size="lg">
        <Container>
          <GlassPanel className="p-6 sm:p-10">
            <Carousel opts={{ align: "start", loop: true }} className="w-full">
              <Reveal className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="eyebrow">{copy(text, "featured_eyebrow", "Selected work")}</p>
                  <h2 className="mt-4 font-display text-3xl lg:text-4xl">
                    {copy(text, "featured_title", "Stories in color.")}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <Link to="/portfolio" className="text-xs uppercase tracking-widest text-primary">
                    View all work
                  </Link>
                  {/* Arrows live inside Carousel so they drive the same embla instance. */}
                  <div className="flex gap-2">
                    <CarouselPrevious className="static translate-y-0" />
                    <CarouselNext className="static translate-y-0" />
                  </div>
                </div>
              </Reveal>

              <CarouselContent className="mt-10 -ml-4">
                {catsPending
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <CarouselItem key={i} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
                        <Skeleton className="aspect-[4/5] w-full" />
                      </CarouselItem>
                    ))
                  : cats.map((cat) => (
                      <CarouselItem key={cat.id} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
                        <Link
                          to="/portfolio"
                          search={{ category: cat.slug }}
                          className="group flex h-full flex-col"
                        >
                          {/* aspect-[4/5] fixes every frame to the same height, whatever
                              the photograph's own orientation. */}
                          <Img
                            image={coverFor(photos, cat)}
                            className="aspect-[4/5] w-full"
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            imgClassName="transition-transform duration-700 group-hover:scale-105"
                          />
                          <div className="mt-4 flex items-center justify-between">
                            <h3 className="font-display text-lg">{cat.name}</h3>
                            <ArrowRight className="size-5 text-primary transition-transform group-hover:translate-x-1" />
                          </div>
                        </Link>
                      </CarouselItem>
                    ))}
              </CarouselContent>
            </Carousel>
          </GlassPanel>
        </Container>
      </Section>

      {/* Philosophy — full-bleed parallax band */}
      <ParallaxScene image={philosophyImage} depth="standard" scrim="full" height="min-h-[72svh]">
        <Section size="lg">
          <Container>
            <Reveal className="grid gap-12 lg:grid-cols-2">
              <div>
                <Camera className="size-8 text-primary" />
                <RichText
                  html={copy(text, "philosophy_title", "Nothing forced.<br/><em>Everything felt.</em>")}
                  className="mt-8 font-display text-3xl leading-none lg:text-4xl"
                />
              </div>
              <div className="self-end">
                <p className="text-lg leading-8 text-foreground/75">{copy(text, "philosophy_body", "")}</p>
                <Button asChild variant="glass" size="lg" className="mt-8">
                  <Link to="/about">My approach</Link>
                </Button>
              </div>
            </Reveal>
          </Container>
        </Section>
      </ParallaxScene>

      {/* Testimonials */}
      {quotes.length > 0 ? (
        <Section size="base">
          <Container>
            <Reveal>
              <p className="eyebrow">{copy(text, "testimonials_eyebrow", "Kind words")}</p>
              <Grid cols={3} gap="hairline" className="mt-10">
                {quotes.map((t) => (
                  <Card key={t.id} className="p-8">
                    <CardBody>
                      <Sparkles className="size-4 text-primary" />
                      <blockquote className="mt-8 font-display text-lg leading-snug">“{t.quote}”</blockquote>
                    </CardBody>
                    <CardFooter className="pt-8 text-xs uppercase tracking-widest text-muted-foreground">
                      {t.author}
                      {t.context ? ` · ${t.context}` : ""}
                    </CardFooter>
                  </Card>
                ))}
              </Grid>
            </Reveal>
          </Container>
        </Section>
      ) : null}

      {/* Instagram strip */}
      <Section size="sm" bleed className="overflow-hidden">
        <div className="grid grid-cols-3 md:grid-cols-6">
          {cats.map((cat) => (
            <Link key={cat.id} to="/portfolio" search={{ category: cat.slug }} className="group">
              <Img
                image={coverFor(photos, cat)}
                className="aspect-square"
                sizes="(min-width: 768px) 17vw, 34vw"
                imgClassName="transition-transform duration-700 group-hover:scale-110"
              />
            </Link>
          ))}
        </div>
        <p className="mt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
          {settings?.["instagram_url"] ? (
            <a href={settings["instagram_url"]} target="_blank" rel="me noopener noreferrer">
              {copy(text, "instagram_caption", "Follow the work · Instagram")}
            </a>
          ) : (
            copy(text, "instagram_caption", "Follow the work · Instagram")
          )}
        </p>
      </Section>

      {/* Closing CTA */}
      <Section size="lg" className="text-center">
        <Container width="content">
          <Reveal>
            <p className="eyebrow">{copy(text, "cta_eyebrow", "Your story, honestly told")}</p>
            <h2 className="mx-auto mt-5 font-display text-3xl leading-tight lg:text-5xl">
              {copy(text, "cta_title", "Let’s make something that feels like you.")}
            </h2>
            <Button asChild variant="cinematic" size="lg" className="mt-10">
              <Link to="/book">
                Book a session <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
