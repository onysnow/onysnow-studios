import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, ClipboardCopy } from "lucide-react";
import { coverPhotosQuery } from "@/lib/content";
import { PhotoSection } from "@/components/site/PhotoSection";
import { Img } from "@/components/site/Img";
import {
  applyTuning,
  resetTuning,
  serializeTuning,
  tuning,
  TUNING_DEFAULTS,
  type Knob,
} from "@/lib/tuning";
import { Button } from "@/components/ui/button";

const STORE = "onysnow:tuning";

export const Route = createFileRoute("/lab")({
  // Client only: every control here drives a live effect, and there is nothing
  // to server-render but a form.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Effect lab — OnySnow Studios" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Lab,
});

/**
 * Every number in the effect layer, on a slider, over the real thing.
 *
 * The knobs have existed for a while and have been unreachable the whole time,
 * which made "it's tunable" a claim rather than a fact — each one added was
 * another number only I could change, by editing a file and waiting for a
 * rebuild. This is the page that makes them true.
 *
 * The preview is a real `PhotoSection`: an actual photograph, an actual pane
 * over it with actual copy on it. Not a swatch. The whole difficulty with this
 * effect layer is that the pieces interact — the grime dims where a shadow
 * lands, the bevel decides where the light piles up, the paper gloss has to
 * stay under the glass's — so a control that changed one of them in isolation
 * would be worse than none.
 *
 * Values are held in localStorage so a reload does not lose an afternoon's
 * tuning. Reset goes back to what is baked into the source, and Copy gives
 * something to paste over it.
 */
function Lab() {
  const photos = useQuery(coverPhotosQuery);
  // The knobs are a plain mutable object read by rAF loops, so React is only
  // being asked to redraw the controls; the effects pick the values up on their
  // own next frame.
  const [, redraw] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) {
        for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, number>)) {
          if (tuning[key] && typeof value === "number") tuning[key]!.value = value;
        }
      }
    } catch {
      // A blocked or corrupt store is not a reason to fail to open the page.
    }
    applyTuning();
    redraw((n) => n + 1);
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map<string, [string, Knob][]>();
    for (const entry of Object.entries(tuning)) {
      const list = byGroup.get(entry[1].group) ?? [];
      list.push(entry);
      byGroup.set(entry[1].group, list);
    }
    return [...byGroup.entries()];
  }, []);

  const set = useCallback((key: string, value: number) => {
    const knob = tuning[key];
    if (!knob) return;
    knob.value = value;
    applyTuning();
    redraw((n) => n + 1);
    try {
      const current = Object.fromEntries(Object.entries(tuning).map(([k, v]) => [k, v.value]));
      localStorage.setItem(STORE, JSON.stringify(current));
    } catch {
      // Tuning still works without somewhere to remember it.
    }
  }, []);

  const photo = photos.data?.[0];

  return (
    <main className="min-h-screen pb-32">
      <PhotoSection image={photo}>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Effect lab</p>
          <h1 className="mt-3 font-display text-4xl">Every number, over the real thing.</h1>
          <p className="mt-4 text-muted-foreground">
            This pane, this photograph and this paragraph are the same components the site is built
            from, so what you change here is what you will see there. Move the pointer across them
            while you tune — most of these do nothing until the light is on them.
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

      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetTuning(TUNING_DEFAULTS);
              try {
                localStorage.removeItem(STORE);
              } catch {
                /* nothing to clear */
              }
              redraw((n) => n + 1);
              toast.success("Back to the values in the source");
            }}
          >
            <RotateCcw /> Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(serializeTuning())
                .then(() => toast.success("Copied — paste it over the defaults in tuning.ts"))
                .catch(() => toast.error("Could not reach the clipboard"));
            }}
          >
            <ClipboardCopy /> Copy values
          </Button>
          <span className="text-sm text-muted-foreground">
            Kept in this browser until you reset.
          </span>
        </div>

        {/*
          The rasterised glass is kept apart from everything else, and the
          separation is not cosmetic.

          Every other group on this page drives the CSS-and-WebGL effect layer,
          which is live on the site. These drive ybouane's shader, which only
          runs under `?glass=raster`. Mixed into one list they look like knobs
          that are not working -- they are not connected to what you are
          looking at unless you are in that mode, and nothing on the slider
          says so.
        */}
        {groups.map(([group, knobs]) => (
          <section
            key={group}
            className={
              group === "Liquid glass"
                ? "mb-12 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/[0.03] p-6"
                : "mb-12"
            }
          >
            <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {group}
            </h2>
            {group === "Liquid glass" ? (
              <p className="mb-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                The rasterised glass shader. These do nothing unless the page is in{" "}
                <code className="text-[var(--amber)]">?glass=raster</code> — in CSS mode the panes
                are backdrop-filter and an SVG displacement map, and none of this reaches them.
                Bevel depth has the most leverage of anything here: across the flat face of a pane
                the surface normal is (0,&nbsp;0,&nbsp;1), so refraction, fresnel and every specular
                are exactly zero there. All of the glass lives on the edge.
              </p>
            ) : null}
            <div className="space-y-6">
              {knobs.map(([key, knob]) => (
                <div key={key} className="grid gap-2 sm:grid-cols-[16rem_1fr_6rem] sm:items-center">
                  <label htmlFor={`knob-${key}`} className="text-sm">
                    {knob.label}
                  </label>
                  <input
                    id={`knob-${key}`}
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    value={knob.value}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="w-full accent-[var(--amber)]"
                  />
                  <input
                    type="number"
                    aria-label={`${knob.label} value`}
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    value={knob.value}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="w-full rounded border border-input bg-transparent px-2 py-1 text-right font-mono text-sm"
                  />
                  {knob.hint ? (
                    <p className="text-sm text-muted-foreground sm:col-span-3 sm:-mt-1">
                      {knob.hint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
