import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageIntro } from "@/components/site/PageIntro";
import { RichText } from "@/components/site/RichText";
import { copy, pageCopyQuery } from "@/lib/content";

export const Route=createFileRoute("/privacy")({head:()=>({meta:[{title:"Privacy — OnySnow Studios"},{name:"description",content:"Privacy information for the OnySnow Studios website."},{property:"og:title",content:"Privacy — OnySnow Studios"},{property:"og:description",content:"How OnySnow Studios handles website and inquiry information."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),component:Privacy});

function Privacy(){
  const { data: text, isPending } = useQuery(pageCopyQuery("privacy"));
  return <><PageIntro loading={isPending} eyebrow="Legal" title={copy(text,"intro_title","Privacy")} body={copy(text,"intro_body","")}/><article className="mx-auto max-w-3xl px-5 pb-28 sm:px-8"><RichText html={copy(text,"body","")} className="leading-8 text-muted-foreground"/></article></>;
}
