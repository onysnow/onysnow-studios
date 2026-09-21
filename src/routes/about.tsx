import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Img } from "@/components/site/Img";
import { PageIntro } from "@/components/site/PageIntro";
import { Reveal } from "@/components/site/Reveal";
import { RichText } from "@/components/site/RichText";
import { copy, pageCopyQuery, photosQuery } from "@/lib/content";

export const Route=createFileRoute("/about")({head:()=>({meta:[{title:"About Ony Shannon — OnySnow Studios"},{name:"description",content:"Meet Ony Shannon and learn about his candid-first, cinematic approach to photography."},{property:"og:title",content:"About Ony Shannon — OnySnow Studios"},{property:"og:description",content:"The story and approach behind OnySnow Studios."},{property:"og:type",content:"profile"},{name:"twitter:card",content:"summary_large_image"}]}),component:About});

function About(){
  const { data: text, isPending } = useQuery(pageCopyQuery("about"));
  const { data: photos } = useQuery(photosQuery);
  const portrait = photos?.find((p) => p.height > p.width) ?? photos?.[0];
  return <>
    <PageIntro loading={isPending} eyebrow={copy(text,"intro_eyebrow","About Ony")} title={copy(text,"intro_title","I photograph people as they are—not as they’re told to be.")} body={copy(text,"intro_body","")}/>
    <section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto grid max-w-screen-2xl gap-14 lg:grid-cols-2 lg:items-center"><Reveal><Img image={portrait} className="aspect-[4/5]"/></Reveal><Reveal className="lg:px-10"><p className="eyebrow">{copy(text,"story_eyebrow","My story")}</p><h2 className="mt-5 font-display text-3xl">{copy(text,"story_title","The camera taught me to notice.")}</h2><RichText html={copy(text,"story_body","")} className="mt-7 space-y-5 leading-8 text-muted-foreground"/></Reveal></div></section>
    <section className="border-y border-border px-5 py-24 sm:px-8 lg:px-12"><Reveal className="mx-auto max-w-5xl text-center"><p className="eyebrow">{copy(text,"process_eyebrow","The process")}</p><h2 className="mt-5 font-display text-4xl">{copy(text,"process_title","Listen. Observe. Make space. Deliver with care.")}</h2><p className="mx-auto mt-7 max-w-2xl leading-8 text-muted-foreground">{copy(text,"process_body","")}</p><Button asChild variant="cinematic" size="lg" className="mt-9"><Link to="/book">Work with me</Link></Button></Reveal></section>
  </>;
}
