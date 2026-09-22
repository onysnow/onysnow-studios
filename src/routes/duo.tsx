import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Img } from "@/components/site/Img";
import { PageIntro } from "@/components/site/PageIntro";
import { InquiryForm } from "@/components/site/InquiryForm";
import { Reveal } from "@/components/site/Reveal";
import { Container, Section } from "@/components/site/layout";
import { copy, pageCopyQuery, coverPhotosQuery, settingsQuery } from "@/lib/content";

export const Route = createFileRoute("/duo")({
  head: () => ({
    meta: [
      { title: "Father & Daughter Shoots — OnySnow Studios" },
      {
        name: "description",
        content:
          "A photographer and a young model, booked together for family brands, kidswear and events. Enquiry only.",
      },
      { property: "og:title", content: "Father & Daughter Shoots — OnySnow Studios" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      // Not indexed while the offer is being figured out; remove when ready.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DuoPage,
});

/**
 * The father & daughter offer.
 *
 * This component deliberately takes no name and no age — the shape of the page
 * makes those impossible to add casually later. There is also no booking button
 * anywhere on it: the only route forward is an enquiry Ony reads himself.
 *
 * Hidden until `duo_enabled` is turned on in the portal.
 */
function DuoPage() {
  const { data: settings, isPending: settingsPending } = useQuery(settingsQuery);
  const { data: text, isPending: textPending } = useQuery(pageCopyQuery("duo"));
  const { data: photos } = useQuery(coverPhotosQuery);

  const enabled = (settings?.["duo_enabled"] ?? "false").toLowerCase() === "true";
  const portrait = photos?.find((p) => p.height > p.width) ?? photos?.[0];

  if (settingsPending) return <Section size="lg" className="pt-32" children={null} />;

  if (!enabled) {
    return (
      <Section size="lg" className="pt-32 text-center">
        <Container width="content">
          <h1 className="font-display text-3xl">Not open yet.</h1>
          <p className="mt-5 leading-8 text-muted-foreground">
            This service isn’t taking enquiries at the moment.
          </p>
          <Link to="/services" className="mt-8 inline-block text-primary">
            See the other services
          </Link>
        </Container>
      </Section>
    );
  }

  const included = [
    "Photographer and young model together, as a pair",
    "Suited to kidswear, family brands, toys and lifestyle",
    "Half or full day, on location or in studio",
    "Usage licence agreed in writing before the shoot",
    "A parent present and directing throughout",
  ];

  return (
    <>
      <PageIntro
        loading={textPending}
        eyebrow={copy(text, "intro_eyebrow", "Father & daughter")}
        title={copy(text, "intro_title", "Two of us, one frame.")}
        body={copy(
          text,
          "intro_body",
          "I shoot, and my daughter models. It’s an unusual pairing that suits brands making things for families — the warmth is real, because it is.",
        )}
      />

      <Section size="none" className="pb-20 lg:pb-28">
        <Container className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <Img image={portrait} className="aspect-[4/5]" sizes="(min-width: 1024px) 50vw, 100vw" />
          </Reveal>
          <Reveal>
            <h2 className="font-display text-2xl lg:text-3xl">
              {copy(text, "detail_title", "What it is")}
            </h2>
            <ul className="mt-8 space-y-4">
              {included.map((item) => (
                <li key={item} className="flex gap-3 leading-7">
                  <Check className="mt-1.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm leading-7 text-muted-foreground">
              {copy(
                text,
                "detail_note",
                "Because this involves my child, it isn’t instantly bookable and never will be. Tell me about the work and I’ll reply personally if it’s a fit.",
              )}
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section size="base" tone="bordered">
        <Container width="content">
          <p className="eyebrow">Enquire</p>
          <h2 className="mt-4 font-display text-2xl lg:text-3xl">
            {copy(text, "form_title", "Tell me about the shoot.")}
          </h2>
          <div className="mt-10">
            <InquiryForm
              kind="duo"
              successNote="I read every one of these myself. If it’s a fit I’ll reply within a few days to talk details — nothing is scheduled before we’ve spoken."
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
