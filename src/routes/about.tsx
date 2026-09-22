import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Img } from "@/components/site/Img";
import { PageIntro } from "@/components/site/PageIntro";
import { Container, Section } from "@/components/site/layout";
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
    <Section size="none" className="pb-20 lg:pb-28"><Container className="grid gap-14 lg:grid-cols-2 lg:items-center"><Reveal><Img image={portrait} className="aspect-[4/5]"/></Reveal><Reveal className="lg:px-10"><p className="eyebrow">{copy(text,"story_eyebrow","My story")}</p><h2 className="mt-5 font-display text-3xl">{copy(text,"story_title","The camera taught me to notice.")}</h2><RichText html={copy(text,"story_body","")} className="mt-7 space-y-5 leading-8 text-muted-foreground"/></Reveal></Container></Section>
    <Section size="base" tone="bordered" className="text-center"><Container width="content"><Reveal><p className="eyebrow">{copy(text,"process_eyebrow","The process")}</p><h2 className="mt-5 font-display text-4xl">{copy(text,"process_title","Listen. Observe. Make space. Deliver with care.")}</h2><p className="mx-auto mt-7 max-w-2xl leading-8 text-muted-foreground">{copy(text,"process_body","")}</p><Button asChild variant="cinematic" size="lg" className="mt-9"><Link to="/book">Work with me</Link></Button></Reveal></Container></Section>
  </>;
}
