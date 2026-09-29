import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, ClipboardCopy, Copy, Layers } from "lucide-react";
import { coverPhotosQuery, settingsQuery } from "@/lib/content";
import { saveSiteTuning } from "@/lib/admin";
import { useAdminStatus } from "@/hooks/use-admin";
import { PhotoSection } from "@/components/site/PhotoSection";
import { ParallaxScene } from "@/components/site/ParallaxScene";
import { Img } from "@/components/site/Img";
import {
  applyTuning,
  isPerMode,
  isResult,
  RESULTS,
  resetTuning,
  applySiteTuning,
  savedTuning,
  SITE_TUNING_KEY,
  serializeTuning,
  setValueIn,
  tuning,
  tuningMode,
  valueIn,
  TUNING_DEFAULTS,
  type Knob,
  type TuningMode,
} from "@/lib/tuning";
import { toggleGlassMode, useGlassMode } from "@/lib/glass-mode";
import { Button } from "@/components/ui/button";
import { Pane } from "@/effects/react/Pane";
import { Stack } from "@/effects/react/Stack";

/** One knob, bound to a given mode's copy of its value. */
function KnobRow({
  id,
  knob,
  value,
  onChange,
}: {
  id: string;
  knob: Knob;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[16rem_1fr_6rem] sm:items-center">
      <label htmlFor={id} className="text-sm">
        {knob.label}
      </label>
      <input
        id={id}
        type="range"
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--amber)]"
      />
      <input
        type="number"
        aria-label={`${knob.label} value`}
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-input bg-transparent px-2 py-1 text-right font-mono text-sm"
      />
      {knob.hint ? (
        <p className="text-sm text-muted-foreground sm:col-span-3 sm:-mt-1">{knob.hint}</p>
      ) : null}
    </div>
  );
}

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

  /*
   * What the lab edits is the SITE's tuning: what every visitor sees
   * (SITE_TUNING_KEY in site_settings). It starts from what is published;
   * each change is applied live and, when you are signed in as the admin,
   * saved for everyone a moment after you stop moving the slider. Signed
   * out, changes stay in this browser only, and the lab says so.
   */
  const settings = useQuery(settingsQuery);
  const admin = useAdminStatus();
  const queryClient = useQueryClient();
  const canPublish = Boolean(admin.data?.isAdmin);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current || settings.data === undefined) return;
    loaded.current = true;
    applySiteTuning(settings.data[SITE_TUNING_KEY]);
    redraw((n) => n + 1);
  }, [settings.data]);

  const saveTimer = useRef<number | null>(null);
  const publish = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      if (!canPublish) return;
      setSaveState("saving");
      saveSiteTuning(SITE_TUNING_KEY, savedTuning())
        .then(() => {
          setSaveState("saved");
          void queryClient.invalidateQueries({ queryKey: ["site_settings"] });
        })
        .catch(() => {
          setSaveState("error");
          toast.error("Could not save for everyone -- are you signed in as the admin?");
        });
    }, 700);
  }, [canPublish, queryClient]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, [string, Knob][]>();
    for (const entry of Object.entries(tuning)) {
      // Results have no control: physics sets them (RESULTS in tuning.ts).
      if (isResult(entry[0])) continue;
      const list = byGroup.get(entry[1].group) ?? [];
      list.push(entry);
      byGroup.set(entry[1].group, list);
    }
    return [...byGroup.entries()];
  }, []);

  const set = useCallback(
    (key: string, value: number, mode?: TuningMode) => {
      const knob = tuning[key];
      if (!knob) return;
      setValueIn(key, mode ?? tuningMode(), value);
      applyTuning();
      redraw((n) => n + 1);
      publish();
    },
    [publish],
  );

  const mode = useGlassMode();
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

      {/*
       * Stacks (light step E): the same two panes three ways. Lab only -- no
       * live page uses a stack yet.
       */}
      {/*
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

      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="mb-3 text-xs text-muted-foreground" data-lab-save={saveState}>
          {canPublish
            ? saveState === "saving"
              ? "Saving for everyone…"
              : saveState === "saved"
                ? "Saved — this is how every visitor sees the site."
                : saveState === "error"
                  ? "Not saved. Check you are signed in as the admin."
                  : "Changes here are saved for every visitor."
            : "Sign in as the admin to save these for every visitor. Until then, changes are only in this browser and are lost on reload."}
        </p>
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetTuning(TUNING_DEFAULTS);
              redraw((n) => n + 1);
              publish();
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = toggleGlassMode();
              redraw((n) => n + 1);
              toast.success(next === "raster" ? "Liquid glass" : "CSS glass");
            }}
          >
            <Layers /> {mode === "raster" ? "Liquid glass" : "CSS glass"}
          </Button>
          <span className="text-sm text-muted-foreground">
            Kept in this browser until you reset. Groups that do nothing in the current mode are
            folded away. These are causes only: the {Object.keys(RESULTS).length} results they
            produce have no control.
          </span>
        </div>

        {/*
          Nothing on this page shows you a knob that is not connected to what
          you are looking at.

          Two separate problems, and they are not the same problem:

          1. DEAD IN THIS MODE. The Liquid glass group drives ybouane's
             shader, which only runs under `?glass=raster`. In CSS mode those
             sliders move and nothing happens. They are folded away rather
             than deleted -- you can still open them, and the summary says why
             they are shut.

          2. LIVE IN BOTH, BUT NOT THE SAME NUMBER. The light pass, the cast
             shadows, the reflection and the pane's own surface all run
             whichever glass is in front of them, but they do not want the
             same values in both: a sheen that sits right on a backdrop-filter
             pane is wrong over a refracting one. Those groups keep a set per
             mode. What you see is the ACTIVE set; the other one is folded
             underneath so it is reachable without switching and, more to the
             point, so it is obvious it exists.
        */}
        {groups.map(([group, knobs]) => {
          const dead = knobs.every((entry) => entry[1].modes === "raster") && mode !== "raster";
          const twinned = knobs.some((entry) => isPerMode(entry[1]));
          const other: TuningMode = mode === "raster" ? "css" : "raster";

          const rows = (
            <div className="space-y-6">
              {knobs.map(([key, knob]) => (
                <KnobRow
                  key={key}
                  id={`knob-${key}`}
                  knob={knob}
                  value={valueIn(key, mode)}
                  onChange={(value) => set(key, value, mode)}
                />
              ))}
            </div>
          );

          if (dead) {
            return (
              <details key={group} className="mb-6 rounded-lg border border-border/60 p-4">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {group} — {knobs.length} knobs, nothing to see in CSS mode
                </summary>
                <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  These drive the rasterised glass shader, which only runs in liquid mode. In CSS
                  mode the panes are backdrop-filter and an SVG displacement map and none of this
                  reaches them, so moving these does nothing to the preview above. Switch the glass
                  to make them live. Edge width (under Glass shape) has the most leverage on this
                  glass: across the flat face of a pane the surface normal is (0,&nbsp;0,&nbsp;1),
                  so refraction, fresnel and every specular are exactly zero there. All of the glass
                  lives on the edge.
                </p>
                <div className="mt-6 opacity-60">{rows}</div>
              </details>
            );
          }

          return (
            <section
              key={group}
              className={
                group === "Liquid glass"
                  ? "mb-12 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/[0.03] p-6"
                  : "mb-12"
              }
            >
              <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {group}{" "}
                {twinned ? (
                  <span className="ml-2 normal-case tracking-normal text-[var(--amber)]">
                    {mode === "raster" ? "liquid" : "CSS"} set
                  </span>
                ) : null}
              </h2>
              {group === "Liquid glass" ? (
                <p className="mb-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  The rasterised glass shader, live right now. Edge width (under Glass shape) has
                  the most leverage of anything here: across the flat face of a pane the surface
                  normal is (0,&nbsp;0,&nbsp;1), so refraction, fresnel and every specular are
                  exactly zero there. All of the glass lives on the edge.
                </p>
              ) : null}
              {rows}
              {twinned ? (
                <details className="mt-6 rounded-lg border border-border/60 p-4">
                  <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    The {other === "raster" ? "liquid" : "CSS"} set — not in effect right now
                  </summary>
                  <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    The same knobs, as they stand for the other glass. Editing them here changes
                    nothing on screen until you switch; they are shown so it is clear the two are
                    kept apart, and so one can be brought into line with the other without switching
                    back and forth.
                  </p>
                  <div className="mt-4 mb-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        for (const [key, knob] of knobs) {
                          if (isPerMode(knob)) setValueIn(key, other, valueIn(key, mode));
                        }
                        redraw((n) => n + 1);
                        toast.success(
                          `Copied this set to ${other === "raster" ? "liquid" : "CSS"}`,
                        );
                      }}
                    >
                      <Copy /> Copy the live set over these
                    </Button>
                  </div>
                  <div className="space-y-6 opacity-70">
                    {knobs.map(([key, knob]) => (
                      <KnobRow
                        key={key}
                        id={`knob-${other}-${key}`}
                        knob={knob}
                        value={valueIn(key, other)}
                        onChange={(value) => set(key, value, other)}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
