import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookingEmbed } from "@/components/site/BookingEmbed";
import { PageIntro } from "@/components/site/PageIntro";
import { copy, pageCopyQuery, settingsQuery } from "@/lib/content";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/book")({head:()=>({meta:[{title:"Book a Session — OnySnow Studios"},{name:"description",content:"Start planning your photography session with OnySnow Studios."},{property:"og:title",content:"Book a Session — OnySnow Studios"},{property:"og:description",content:"Tell us what you are imagining and start planning your shoot."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Book});

function Book(){
  const { data: text, isPending } = useQuery(pageCopyQuery("book"));
  const { data: settings } = useQuery(settingsQuery);
  const bookingUrl = settings?.["booking_url"];
  return <>
    <PageIntro loading={isPending} eyebrow={copy(text,"intro_eyebrow","Book a session")} title={copy(text,"intro_title","Let’s begin with your story.")} body={copy(text,"intro_body","")}/>
    <section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto max-w-4xl">
      {/* BOOKING INTEGRATION SEAM — a scheduling/payment URL set in the admin portal renders here; the embed is the fallback. */}
      {bookingUrl ? <div className="text-center"><Button asChild variant="cinematic" size="lg"><a href={bookingUrl} target="_blank" rel="noreferrer">Open the booking calendar</a></Button></div> : <BookingEmbed/>}
    </div></section>
  </>;
}
