import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { coverPhotosQuery } from "@/lib/content";
import { PhotoSection } from "@/components/site/PhotoSection";
import { ParallaxScene } from "@/components/site/ParallaxScene";
import { Img } from "@/components/site/Img";
import { Pane } from "@/effects/react/Pane";
import { Stack } from "@/effects/react/Stack";
import { Neon } from "@/components/site/Neon";
import { GlowPaint } from "@/components/site/GlowPaint";
import { GlassSolid } from "@/components/site/GlassSolid";
import { previewing } from "@/effects/engine/preview";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/lab-samples")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lab samples — OnySnow Studios" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LabSamples,
});

/**
 * The pieces no live page shows yet, on the real components: one of the
 * pages the lab's preview can show (Lab samples, in its page list).
 *
 * This was the lab itself until the lab became an editor with the site beside
 * it. The pieces interact -- the grime dims where a shadow lands, the bevel
 * decides where the light piles up -- so it is still a real pane over a real
 * photograph, not a swatch.
 */
function LabSamples() {
  const photos = useQuery(coverPhotosQuery);
  const photo = photos.data?.[0];
  // The glass solids are a preview (?try=solids) until Ony approves them.
  const [solids, setSolids] = useState(false);
  useEffect(() => setSolids(previewing("solids")), []);

  return (
    <div className="min-h-screen pb-32">
      <PhotoSection image={photo}>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Lab samples</p>
          <h1 className="mt-3 font-display text-4xl">Every number, over the real thing.</h1>
          <p className="mt-4 text-muted-foreground">
            This pane, this photograph and this paragraph are the same components the site is built
            from. Move the pointer across them while you tune — most of the controls do nothing
            until the light is on them.
          </p>
          {photo ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Img image={photo} sizes="(min-width: 640px) 50vw, 100vw" className="aspect-[3/2]" />
              <Img
                image={photos.data?.[1] ?? photo}
                sizes="(min-width: 640px) 50vw, 100vw"
                className="aspect-[3/2]"
              />
            </div>
          ) : null}
        </div>
      </PhotoSection>

      {/*
       * Stacks (light step E): the same two panes three ways. No live page
       * uses a stack yet.
       *
       * On the photograph itself, not on a section pane: a pane inside a pane
       * cannot see past its container (the outer pane's blur is a backdrop
       * root), so nested, these frosted a tinted box and drew as hard
       * squares with the container's shadow round them (Ony, 2026-09-29).
       * Each stack rests on the picture, as a stack on the site would.
       */}
      <ParallaxScene image={photos.data?.[2] ?? photo} scrim="none" height="">
        <div className="mx-auto max-w-5xl px-6 py-16" data-lab-stacks>
          <Pane className="max-w-2xl !p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Stacks</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Two panes, one resting on the other. With air between them each keeps its own surfaces
              and the light bounces between them; bonded, they are one thick pane.
            </p>
          </Pane>
          <div className="mt-8 grid gap-10 sm:grid-cols-3">
            {(
              [
                ["air", 24, "Air, 24 px"],
                ["contact", 0, "Contact"],
                ["bonded", 0, "Bonded"],
              ] as const
            ).map(([link, gap, label]) => (
              <Stack key={link} interface={link} gap={gap} className="relative h-56">
                <Pane className="!absolute left-0 top-0 h-40 w-[80%] !p-4" thickness={18}>
                  <span className="text-xs text-muted-foreground">below</span>
                </Pane>
                <Pane className="!absolute bottom-0 right-0 h-40 w-[80%] !p-4" thickness={18}>
                  <span className="text-xs">{label}</span>
                </Pane>
              </Stack>
            ))}
          </div>
        </div>
      </ParallaxScene>

      {/*
       * Neon (item 23): two signs over a photograph, each a real tube and a
       * light in the scene -- the glass below catches them.
       */}
      <ParallaxScene image={photos.data?.[3] ?? photo} scrim="none" height="">
        <div className="mx-auto max-w-5xl px-6 py-20" data-lab-neon>
          <div className="flex flex-col items-center gap-10 py-10">
            <Neon gas="pink" flicker="flicker" className="text-7xl sm:text-8xl">
              OnySnow
            </Neon>
            <Neon gas="blue" flicker="dying" className="text-4xl tracking-[0.3em]">
              OPEN LATE
            </Neon>
          </div>
          <Pane className="mx-auto mt-6 max-w-2xl !p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Neon</p>
            <p className="mt-3 text-sm text-muted-foreground">
              One glass tube per word, bent the way sign-makers bend it (Tilt Neon), with the runs
              between letters painted out and an electrode at each end. Lit, the gas burns white in
              the middle of the tube and in its colour at the walls; dropped out, it is pale glass.
              Each sign is a line of light in the scene, so this pane catches them. Top: a loose
              electrode. Bottom: a dying transformer.
            </p>
          </Pane>
        </div>
      </ParallaxScene>

      {/*
       * Glass solids (item 25g, ?try=solids): held over a photograph, each
       * traced through by the physics of its glass (effects/optics/solids).
       */}
      {solids ? (
        <ParallaxScene image={photos.data?.[1] ?? photo} scrim="none" height="">
          <div className="mx-auto max-w-5xl px-6 py-20" data-lab-solids>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <GlassSolid shape="prism" material="dense-flint" />
              <GlassSolid shape="sphere" />
              <GlassSolid shape="cube" />
              <GlassSolid shape="cone" />
              <GlassSolid shape="pyramid" />
              <GlassSolid shape="rod" />
            </div>
            <Pane className="mx-auto mt-6 max-w-2xl !p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Glass solids
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Optical crown glass (the prism is dense flint, which spreads the colours twice as
                far), traced from your eye: each colour bends by its own index, crosses the solid,
                is totally reflected where it cannot get out, and lands on the photograph below. The
                sphere turns the photograph over; the prism fans its edges into colour.
              </p>
            </Pane>
          </div>
        </ParallaxScene>
      ) : null}

      {/* Glow-in-the-dark paint (item 25): draw on it, shine the lamp on it, fire the flash. */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Glow-in-the-dark paint
        </p>
        <GlowPaint className="h-80 w-full" />
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          Phosphor paint keeps light in two stores: one empties in a second or two (the bright first
          flare), the other leaks for minutes (the mid glow that is left). So it drops hard, then
          sits and fades slowly to nothing.
        </p>
      </section>
    </div>
  );
}
