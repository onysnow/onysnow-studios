import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, Camera, Sparkles } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Img } from "@/components/site/Img";
import { Reveal } from "@/components/site/Reveal";
import { RichText } from "@/components/site/RichText";
import { categoriesQuery, copy, coverFor, pageCopyQuery, photosQuery, settingsQuery, testimonialsQuery } from "@/lib/content";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "OnySnow Studios — Professional Candid Photography" },
    { name: "description", content: "Cinematic candid, event, portrait, fine art, cosplay, and street photography by Ony Shannon." },
    { property: "og:title", content: "OnySnow Studios — Professional Candid Photography" },
    { property: "og:description", content: "Real moments, cinematic color, and photographs with atmosphere." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}), component: HomePage,
});

function HomePage() {
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, .22], [0, 90]);
  const { data: text } = useQuery(pageCopyQuery("home"));
  const { data: categories, isPending: catsPending } = useQuery(categoriesQuery);
  const { data: photos } = useQuery(photosQuery);
  const { data: testimonials } = useQuery(testimonialsQuery);
  const { data: settings } = useQuery(settingsQuery);

  const cats = categories ?? [];
  const hero = photos?.find((p) => p.featured) ?? photos?.[0];
  const quotes = testimonials ?? [];

  return <>
    <section className="relative min-h-[92svh] overflow-hidden">
      <motion.div className="absolute inset-0" style={{ y: heroY }}><Img image={hero} eager className="h-[105svh] w-full" imgClassName="scale-105 object-[72%_center] sm:object-center" sizes="100vw" /></motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-background/25" />
      <div className="image-vignette absolute inset-0" />
      <div className="relative mx-auto flex min-h-[92svh] max-w-screen-2xl flex-col justify-end px-5 pb-14 sm:px-8 lg:px-12 lg:pb-20">
        <p className="eyebrow">{copy(text, "hero_eyebrow", "Professional candid photography")}</p>
        <h1 className="mt-4 max-w-5xl font-display text-7xl leading-[.88] sm:text-8xl lg:text-[9rem]">{copy(text, "hero_title", "Life, exactly as it felt.")}</h1>
        <div className="mt-8 flex flex-wrap items-center gap-4"><Button asChild variant="cinematic" size="lg"><Link to="/book">Book a session <ArrowRight /></Link></Button><Link to="/portfolio" className="text-xs uppercase tracking-widest text-foreground">Explore the work</Link></div>
      </div>
    </section>

    <section className="px-5 py-24 sm:px-8 lg:px-12 lg:py-36"><Reveal className="mx-auto grid max-w-screen-2xl gap-10 lg:grid-cols-[.55fr_1fr]"><p className="eyebrow">{copy(text, "intro_eyebrow", "What I do")}</p><div><h2 className="max-w-4xl font-display text-5xl leading-tight sm:text-6xl lg:text-7xl">{copy(text, "intro_title", "I photograph the part you didn’t know you’d want to remember.")}</h2><p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">{copy(text, "intro_body", "")}</p></div></Reveal></section>

    <section className="border-y border-border px-5 py-20 sm:px-8 lg:px-12"><div className="mx-auto max-w-screen-2xl"><Reveal><p className="eyebrow">{copy(text, "services_eyebrow", "Ways to work together")}</p><div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3">{catsPending ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="border-t border-border py-8 sm:px-6 lg:py-10"><Skeleton className="h-10 w-40"/></div>) : cats.map((cat, i) => <Link to="/services" key={cat.id} className="group border-t border-border px-0 py-8 sm:px-6 lg:py-10"><span className="text-xs text-muted-foreground">0{i+1}</span><h3 className="mt-8 font-display text-4xl group-hover:text-primary">{cat.name}</h3><ArrowDownRight className="mt-5 size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:translate-y-1" /></Link>)}</div></Reveal></div></section>

    <section className="px-5 py-24 sm:px-8 lg:px-12 lg:py-36"><div className="mx-auto max-w-screen-2xl"><Reveal className="flex items-end justify-between gap-6"><div><p className="eyebrow">{copy(text, "featured_eyebrow", "Selected work")}</p><h2 className="mt-4 font-display text-6xl">{copy(text, "featured_title", "Stories in color.")}</h2></div><Link to="/portfolio" className="hidden text-xs uppercase tracking-widest text-primary sm:block">View all work</Link></Reveal><div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{catsPending ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] w-full"/>) : cats.slice(0,3).map((cat, i) => <Reveal key={cat.id} className={i === 1 ? "lg:translate-y-14" : ""}><Link to="/portfolio/$category" params={{ category: cat.slug }} className="group block"><Img image={coverFor(photos, cat)} className="aspect-[4/5]" imgClassName="transition-transform duration-700 group-hover:scale-105" /><div className="mt-4 flex justify-between"><h3 className="font-display text-3xl">{cat.name}</h3><ArrowRight className="size-5 text-primary" /></div></Link></Reveal>)}</div></div></section>

    <section className="bg-foreground px-5 py-24 text-background sm:px-8 lg:px-12 lg:py-36"><Reveal className="mx-auto grid max-w-screen-2xl gap-12 lg:grid-cols-2"><div><Camera className="size-8 text-teal"/><RichText html={copy(text, "philosophy_title", "Nothing forced.<br/><em>Everything felt.</em>")} className="mt-8 font-display text-6xl leading-none lg:text-8xl"/></div><div className="self-end"><p className="text-lg leading-8 text-background/70">{copy(text, "philosophy_body", "")}</p><Button asChild variant="outline" size="lg" className="mt-8 border-background/30 bg-transparent text-background hover:bg-background hover:text-foreground"><Link to="/about">My approach</Link></Button></div></Reveal></section>

    {quotes.length > 0 ? <section className="px-5 py-24 sm:px-8 lg:px-12"><div className="mx-auto max-w-screen-2xl"><Reveal><p className="eyebrow">{copy(text, "testimonials_eyebrow", "Kind words")}</p><div className="mt-10 grid gap-px bg-border md:grid-cols-3">{quotes.map((t)=><blockquote key={t.id} className="bg-background p-8"><Sparkles className="size-4 text-primary"/><p className="mt-8 font-display text-3xl leading-snug">“{t.quote}”</p><footer className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">{t.author}{t.context ? ` · ${t.context}` : ""}</footer></blockquote>)}</div></Reveal></div></section> : null}

    <section className="overflow-hidden py-16"><div className="grid grid-cols-3 md:grid-cols-6">{cats.map((cat)=><Link key={cat.id} to="/portfolio/$category" params={{category:cat.slug}} className="group"><Img image={coverFor(photos, cat)} className="aspect-square" sizes="(min-width: 768px) 17vw, 34vw" imgClassName="transition-transform duration-700 group-hover:scale-110"/></Link>)}</div><p className="mt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">{settings?.["instagram_url"] ? <a href={settings["instagram_url"]}>{copy(text, "instagram_caption", "Follow the work · Instagram")}</a> : copy(text, "instagram_caption", "Follow the work · Instagram")}</p></section>
    <section className="px-5 py-24 text-center sm:px-8 lg:py-36"><Reveal><p className="eyebrow">{copy(text, "cta_eyebrow", "Your story, honestly told")}</p><h2 className="mx-auto mt-5 max-w-4xl font-display text-6xl leading-none sm:text-7xl lg:text-8xl">{copy(text, "cta_title", "Let’s make something that feels like you.")}</h2><Button asChild variant="cinematic" size="lg" className="mt-10"><Link to="/book">Book a session <ArrowRight/></Link></Button></Reveal></section>
  </>;
}
