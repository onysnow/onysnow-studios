import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/site/PageIntro";
import { copy, pageCopyQuery, servicesQuery } from "@/lib/content";

export const Route=createFileRoute("/services")({head:()=>({meta:[{title:"Services & Pricing — OnySnow Studios"},{name:"description",content:"Photography services for candid sessions, events, portraits, fine art, cosplay, and street stories."},{property:"og:title",content:"Services & Pricing — OnySnow Studios"},{property:"og:description",content:"Choose the photography experience that fits your story."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Services});

function Services(){
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("services"));
  const { data: services, isPending } = useQuery(servicesQuery);
  const list = services ?? [];
  return <>
    <PageIntro loading={textPending} eyebrow={copy(text,"intro_eyebrow","Services & pricing")} title={copy(text,"intro_title","Choose the shape. Keep the feeling.")} body={copy(text,"intro_body","")}/>
    <section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto grid max-w-screen-2xl gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
      {isPending ? Array.from({length:6}).map((_,i)=><div key={i} className="min-h-[30rem] bg-background p-7 sm:p-9"><Skeleton className="h-12 w-40"/><Skeleton className="mt-6 h-20 w-full"/></div>)
        : list.map((service,i)=><article key={service.id} className="flex min-h-[30rem] flex-col bg-background p-7 sm:p-9"><p className="eyebrow">0{i+1}</p><h2 className="mt-5 font-display text-5xl">{service.name}</h2><p className="mt-4 leading-7 text-muted-foreground">{service.summary}</p><ul className="mt-8 space-y-3 text-sm">{(service.included ?? []).map(item=><li key={item} className="flex gap-3"><Check className="size-4 shrink-0 text-primary"/>{item}</li>)}</ul><div className="mt-auto pt-10"><p className="text-xs uppercase tracking-widest text-muted-foreground">Turnaround · {service.turnaround}</p><p className="mt-2 font-display text-3xl">{service.price_display}</p><Button asChild variant="outline" size="lg" className="mt-6 w-full"><Link to="/book">Book this</Link></Button></div></article>)}
    </div></section>
  </>;
}
