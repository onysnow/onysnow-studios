import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageIntro } from "@/components/site/PageIntro";
import { Img } from "@/components/site/Img";
import { Reveal } from "@/components/site/Reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery, copy, coverFor, pageCopyQuery, photosQuery } from "@/lib/content";

export const Route = createFileRoute("/portfolio/")({head:()=>({meta:[{title:"Portfolio — OnySnow Studios"},{name:"description",content:"Explore candid, events, portraits, fine art, cosplay, and street photography."},{property:"og:title",content:"Portfolio — OnySnow Studios"},{property:"og:description",content:"Six disciplines, one cinematic point of view."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Portfolio});

function Portfolio(){
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("portfolio"));
  const { data: categories, isPending } = useQuery(categoriesQuery);
  const { data: photos } = useQuery(photosQuery);
  const cats = categories ?? [];
  return <><PageIntro loading={textPending} eyebrow={copy(text,"intro_eyebrow","Portfolio")} title={copy(text,"intro_title","Unscripted stories. Cinematic frames.")} body={copy(text,"intro_body","")}/><section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto grid max-w-screen-2xl gap-5 md:grid-cols-2">{isPending ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className={i%3===0?"aspect-[16/8] w-full md:col-span-2":"aspect-[4/5] w-full"}/>) : cats.map((cat,i)=><Reveal key={cat.id} className={i%3===0?"md:col-span-2":""}><Link to="/portfolio/$category" params={{category:cat.slug}} className="group relative block overflow-hidden"><Img image={coverFor(photos,cat)} className={i%3===0?"aspect-[16/8]":"aspect-[4/5]"} sizes={i%3===0?"100vw":"50vw"} imgClassName="transition-transform duration-700 group-hover:scale-105"/><div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent"/><div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 sm:p-8"><div><p className="text-xs uppercase tracking-widest text-primary">0{i+1}</p><h2 className="mt-2 font-display text-5xl">{cat.name}</h2></div><ArrowUpRight className="size-7"/></div></Link></Reveal>)}</div></section></>;
}
