import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Img } from "@/components/site/Img";
import { Reveal } from "@/components/site/Reveal";
import { ScrambleText } from "@/components/site/ScrambleText";
import { ParallaxScene, SEAM_ROOM } from "@/components/site/ParallaxScene";
import { RichText } from "@/components/site/RichText";
import { Container, Grid, Section } from "@/components/site/layout";
import { PhotoSection } from "@/components/site/PhotoSection";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  categoriesQuery,
  copy,
  coverFor,
  pageCopyQuery,
  coverPhotosQuery,
  settingsQuery,
  testimonialsQuery,
} from "@/lib/content";
import { photoUrl } from "@/lib/photo-url";
import { pagePhotosQuery, resolveSlot } from "@/lib/page-photos";

export const Route = createFileRoute("/")({
  // Loading on the server means crawlers and social cards get real content
  // instead of skeletons, and the hero image is known before first paint.
  loader: async ({ context: { queryClient } }) => {
    const [photos, chosen] = await Promise.all([
      queryClient.ensureQueryData(coverPhotosQuery),
      queryClient.ensureQueryData(pagePhotosQuery),
      queryClient.ensureQueryData(categoriesQuery),
      queryClient.ensureQueryData(pageCopyQuery("home")),
      queryClient.ensureQueryData(testimonialsQuery),
      queryClient.ensureQueryData(settingsQuery),
    ]);
    const hero = resolveSlot("home.hero", chosen, photos).photo;
    return { ogImage: photoUrl(hero?.storage_path) };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "OnySnow Studios — Professional Candid Photography" },
      {
        name: "description",
        content:
          "Cinematic candid, event, portrait, fine art, cosplay, and street photography by Ony Shannon.",
      },
      { property: "og:title", content: "OnySnow Studios — Professional Candid Photography" },
      {
        property: "og:description",
        content: "Real moments, cinematic color, and photographs with atmosphere.",
      },
      { property: "og:type", content: "website" },
      ...(loaderData?.ogImage ? [{ property: "og:image", content: loaderData.ogImage }] : []),
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

/**
 * How wide the hero photograph is actually drawn, for its `srcset`.
 *
 * "100vw" was a lie for a cover image: when the hero is proportionally taller
 * than the photograph, the photograph is drawn wider than the screen, so the
 * browser picked a file smaller than the space and stretched it -- the 1280px
 * rendition drawn about 1,500px wide was the soft hero Ony saw. The drawn width
 * is the larger of the screen's width and the picture's height times the
 * photograph's shape, plus the viewpoint's few per cent of oversize.
 */
function heroSizes(photo: { width?: number | null; height?: number | null } | undefined): string {
  const aspect = photo?.width && photo.height ? photo.width / photo.height : 1.5;
  // 92vh of hero plus the half of the glass band the picture runs on under
  // (--seam-below, about a quarter of a screen).
  return `max(105vw, ${(118 * aspect * 1.05).toFixed(1)}vh)`;
}

function HomePage() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.22], [0, 90]);

  const { data: text } = useQuery(pageCopyQuery("home"));
  const { data: categories, isPending: catsPending } = useQuery(categoriesQuery);
  const { data: photos } = useQuery(coverPhotosQuery);
  const { data: testimonials } = useQuery(testimonialsQuery);
  const { data: settings } = useQuery(settingsQuery);

  const cats = categories ?? [];
  /*
   * Every photograph on this page is chosen in the Studio (Page photos) and
   * framed on its own focal point there; a spot nobody has chosen shows what
   * it always did (lib/page-photos fallback).
   *
   * The five glass bands (<PhotoSection seam>) have no photograph of their
   * own: they are clear glass over the join between two photographs, and
   * show those. They used to be handed photos[1..5] all the same, which did
   * nothing except make dragging those positions in the library look like it
   * should.
   */
  const { data: chosen } = useQuery(pagePhotosQuery);
  const spot = (key: string) => resolveSlot(key, chosen, photos);
  const hero = spot("home.hero");
  const frameOne = spot("home.frame-1");
  const frameTwo = spot("home.frame-2");
  const frameThree = spot("home.frame-3");
  const philosophy = spot("home.philosophy");
  const quotes = testimonials ?? [];

  return (
    <>
      {/* Hero */}
      <section data-photo className="relative min-h-[92svh]" style={SEAM_ROOM}>
        {/*
         * The clip wraps the PICTURE, not the section -- same reasoning as
         * ParallaxScene, and this is the hero's own copy of that structure.
         *
         * The parallax image slides, so a clip has to exist. On
         * the section it also cropped the glass resting on it: the pane's
         * light layer sits at `inset: -90px` so a lit edge can throw light
         * past the boundary, and cropping that turns the softest part of the
         * bloom into a hard line along the section edge.
         */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute inset-0 max-md:!translate-y-0"
            {...(reduced ? {} : { style: { y: heroY } })}
          >
            {/* Behind the glass: slides under it as the viewpoint moves. */}
            <div
              data-view-shift=""
              suppressHydrationWarning
              className="view-shift absolute inset-0"
            >
              {/*
               * Exactly the section's size, no bigger. It was 105svh tall and
               * scaled a further 5%, room the scroll parallax never uses (it
               * only moves the picture DOWN, and only once the top has
               * scrolled away) -- and every bit of it cropped a wide
               * photograph harder: at a 1192x749 window a 16:9 frame lost a
               * fifth of its width. The viewpoint's own oversize (.view-shift)
               * is all the bleed the picture needs.
               */}
              <Img
                image={hero.photo}
                eager
                className="h-full w-full"
                imgClassName="object-[25%_center] sm:object-center"
                focus={hero.focus}
                sizes={heroSizes(hero.photo)}
              />
            </div>
          </motion.div>
          {/*
            Fades to 60%, not to solid background. The photograph now runs on
            under the first glass band (see SeamSection), and a fade to solid
            put a black strip exactly where the glass is meant to show the rest
            of the picture. The text keeps its contrast from the band of
            darkening it sits in.
          */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-background/20 to-background/25" />
          <div className="image-vignette absolute inset-0" />
        </div>
        <div className="relative flex min-h-[92svh] flex-col justify-end px-5 pb-14 sm:px-8 lg:px-12 lg:pb-20">
          <Container>
            <p className="eyebrow">
              {copy(text, "hero_eyebrow", "Professional candid photography")}
            </p>
            <h1 className="mt-4 max-w-5xl font-display text-[2.75rem] leading-[.95] sm:text-6xl lg:text-[4.5rem]">
              <ScrambleText
                startOnView={false}
                text={copy(text, "hero_title", "Life, exactly as it felt.")}
              />
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
      <PhotoSection seam depth="subtle">
        <Section size="base">
          <Container>
            <Reveal className="grid gap-10 lg:grid-cols-[.4fr_1fr]">
              <p className="eyebrow">{copy(text, "intro_eyebrow", "What I do")}</p>
              <div>
                <h2 className="max-w-3xl font-display text-2xl leading-tight sm:text-3xl lg:text-4xl">
                  <ScrambleText
                    text={copy(
                      text,
                      "intro_title",
                      "I photograph the part you didn’t know you’d want to remember.",
                    )}
                  />
                </h2>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
                  {copy(text, "intro_body", "")}
                </p>
              </div>
            </Reveal>
          </Container>
        </Section>
      </PhotoSection>

      {/*
        A full-bleed photograph between the glass bands.

        These are the parallax moments — nothing but the frame, scrolling
        slower than the page. They also give the glass band that follows
        something to be seen against as it arrives.
      */}
      <ParallaxScene
        image={frameOne.photo}
        focus={frameOne.focus}
        depth="deep"
        scrim="none"
        height="min-h-[48svh] lg:min-h-[62svh]"
      />

      {/* Disciplines — compact, with a thumbnail so the layout reads at a glance */}
      <PhotoSection seam depth="standard">
        <Section size="sm">
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
                        data-cast
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
                            <span className="text-[0.65rem] tracking-widest text-primary">
                              0{i + 1}
                            </span>
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
      </PhotoSection>

      {/*
        A full-bleed photograph between the glass bands.

        These are the parallax moments — nothing but the frame, scrolling
        slower than the page. They also give the glass band that follows
        something to be seen against as it arrives.
      */}
      <ParallaxScene
        image={frameTwo.photo}
        focus={frameTwo.focus}
        depth="standard"
        scrim="none"
        height="min-h-[48svh] lg:min-h-[62svh]"
      />

      {/* Selected work — a horizontal wheel, no container around it */}
      <PhotoSection seam depth="standard">
        <Section size="sm">
          <Container>
            <Carousel opts={{ align: "start", loop: true }} className="w-full">
              <Reveal className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="eyebrow">{copy(text, "featured_eyebrow", "Selected work")}</p>
                  <h2 className="mt-2 font-display text-2xl lg:text-3xl">
                    <ScrambleText text={copy(text, "featured_title", "Stories in color.")} />
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <Link to="/portfolio" className="text-xs uppercase tracking-widest text-primary">
                    View all work
                  </Link>
                  {/* Arrows live inside Carousel so they drive the same embla instance. */}
                  <div className="flex gap-2">
                    <CarouselPrevious className="static size-8 translate-y-0" />
                    <CarouselNext className="static size-8 translate-y-0" />
                  </div>
                </div>
              </Reveal>

              <CarouselContent className="mt-5 -ml-3">
                {catsPending
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <CarouselItem key={i} className="pl-3 basis-4/5 sm:basis-1/2 lg:basis-1/4">
                        <Skeleton className="aspect-[3/2] w-full" />
                      </CarouselItem>
                    ))
                  : cats.map((cat) => (
                      <CarouselItem
                        key={cat.id}
                        className="pl-3 basis-4/5 sm:basis-1/2 lg:basis-1/4"
                      >
                        <Link
                          to="/portfolio"
                          search={{ category: cat.slug }}
                          data-cast
                          className="group flex h-full flex-col"
                        >
                          {/* Fixed 3:2 box keeps every frame the same height whatever the
                              photograph's own orientation, and reads far thinner than 4:3. */}
                          <Img
                            image={coverFor(photos, cat)}
                            className="aspect-[3/2] w-full"
                            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 80vw"
                            imgClassName="transition-transform duration-700 group-hover:scale-105"
                          />
                          <div className="mt-3 flex items-center justify-between">
                            <h3 className="font-display text-base">{cat.name}</h3>
                            <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-1" />
                          </div>
                        </Link>
                      </CarouselItem>
                    ))}
              </CarouselContent>
            </Carousel>
          </Container>
        </Section>
      </PhotoSection>

      {/*
        A full-bleed photograph between the glass bands.

        These are the parallax moments — nothing but the frame, scrolling
        slower than the page. They also give the glass band that follows
        something to be seen against as it arrives.
      */}
      <ParallaxScene
        image={frameThree.photo}
        focus={frameThree.focus}
        depth="deep"
        scrim="none"
        height="min-h-[48svh] lg:min-h-[62svh]"
      />

      {/*
        Testimonials — a glass band like every other, not a panel inside a section.

        It used to be the one piece of glass on the page that got none of the
        glass. `GlassPanel` — now deleted, this was its only caller — was a
        plain blurred div that never registered with the cursor, so it had no
        thickness, no arris, no reflection and no response to the light. It also sat on the page background rather than
        on a photograph, and frosted glass over a flat colour is
        indistinguishable from a slightly lighter rectangle.

        The quotes now sit directly on the band. They were cards — bordered,
        tinted, `backdrop-blur-xl` — which meant a sheet of frosted glass laid
        on a sheet of frosted glass, and the inner one had nothing behind it to
        frost. What separates them now is the grid and a hairline rule, which
        is all the separation three short quotes need.
      */}
      {quotes.length > 0 ? (
        <PhotoSection seam depth="standard">
          <Section size="base">
            <Container>
              <Reveal>
                <p className="eyebrow">{copy(text, "testimonials_eyebrow", "Kind words")}</p>
                <Grid cols={3} gap="base" className="mt-8">
                  {quotes.map((t) => (
                    <figure key={t.id} className="flex h-full flex-col">
                      <blockquote className="font-display text-lg leading-snug">
                        “{t.quote}”
                      </blockquote>
                      <figcaption className="mt-auto border-t border-white/10 pt-5 text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                        {t.author}
                        {t.context ? ` · ${t.context}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </Grid>
              </Reveal>
            </Container>
          </Section>
        </PhotoSection>
      ) : null}

      {/* Closing CTA */}

      {/* Philosophy — full-bleed parallax band */}
      <ParallaxScene
        image={philosophy.photo}
        focus={philosophy.focus}
        depth="standard"
        scrim="full"
        height="min-h-[72svh]"
      >
        <Section size="lg">
          <Container>
            <Reveal className="grid gap-12 lg:grid-cols-2">
              <div>
                <RichText
                  html={copy(
                    text,
                    "philosophy_title",
                    "Nothing forced.<br/><em>Everything felt.</em>",
                  )}
                  className="font-display text-3xl leading-none lg:text-4xl"
                />
              </div>
              <div className="self-end">
                <p className="text-lg leading-8 text-foreground/75">
                  {copy(text, "philosophy_body", "")}
                </p>
                <Button asChild variant="glass" size="lg" className="mt-8">
                  <Link to="/about">My approach</Link>
                </Button>
              </div>
            </Reveal>
          </Container>
        </Section>
      </ParallaxScene>

      <PhotoSection seam depth="deep">
        <Section size="lg" className="text-center">
          <Container width="content">
            <Reveal>
              <p className="eyebrow">{copy(text, "cta_eyebrow", "Your story, honestly told")}</p>
              <h2 className="mx-auto mt-5 font-display text-3xl leading-tight lg:text-5xl">
                <ScrambleText
                  text={copy(text, "cta_title", "Let’s make something that feels like you.")}
                />
              </h2>
              <Button asChild variant="cinematic" size="lg" className="mt-10">
                <Link to="/book">
                  Book a session <ArrowRight />
                </Link>
              </Button>
            </Reveal>
          </Container>
        </Section>
      </PhotoSection>
    </>
  );
}
