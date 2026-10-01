import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Layers,
  Monitor,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Tablet,
  Undo2,
  Upload,
  Info,
} from "lucide-react";
import { settingsQuery } from "@/lib/content";
import { saveSiteTuning } from "@/lib/admin";
import { useAdminStatus } from "@/hooks/use-admin";
import {
  applySiteTuning,
  isPerMode,
  isResult,
  RESULTS,
  resetTuning,
  savedTuning,
  SITE_TUNING_KEY,
  serializeTuning,
  setValueIn,
  tuning,
  TUNING_DEFAULTS,
  valueIn,
  type Knob,
  type TuningMode,
} from "@/lib/tuning";
import { getGlassMode, toggleGlassMode, useGlassMode } from "@/lib/glass-mode";
import { isFromFrame, isToolId, sendLabDraft, sendLabHold, sendLabRedRoom } from "@/lib/lab-bridge";
import { TOOLS, type ToolId } from "@/effects/tools/held";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PREVIEWS,
  setStoredPreview,
  storedPreviews,
  type PreviewName,
} from "@/effects/engine/preview";
import { requireAdmin } from "@/lib/admin-gate";

export const Route = createFileRoute("/lab")({
  // Client only: every control here drives a live effect, and there is nothing
  // to server-render but a form.
  ssr: false,
  // Ony's alone: signed in as the admin (item 48; lib/admin-gate).
  beforeLoad: requireAdmin,
  head: () => ({
    meta: [
      { title: "Effect lab — OnySnow Studios" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Lab,
});

/** The pages the preview can show. Any other page is reachable by clicking through. */
const PAGES = [
  { path: "/", label: "Home" },
  { path: "/portfolio", label: "Portfolio" },
  { path: "/journal", label: "Journal" },
  { path: "/about", label: "About" },
  { path: "/services", label: "Services" },
  { path: "/contact", label: "Contact" },
  { path: "/book", label: "Book" },
  { path: "/duo", label: "Duo" },
  { path: "/lab-samples", label: "Lab samples (stacks)" },
] as const;

const DEVICES = {
  desktop: { width: null, label: "Desktop", icon: Monitor },
  tablet: { width: 834, label: "Tablet width", icon: Tablet },
  // A narrow frame on a desktop still has a mouse, so the glass effects run
  // in it; a real phone skips them (styles.css, pointer: coarse).
  phone: {
    width: 390,
    label: "Phone width (a real phone skips the glass effects)",
    icon: Smartphone,
  },
} as const;
type Device = keyof typeof DEVICES;

/** The unsaved draft, so a reload does not lose an afternoon's tuning. */
const DRAFT_STORE = "onysnow:lab-draft";

function readDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_STORE);
  } catch {
    return null;
  }
}

function writeDraft(value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(DRAFT_STORE);
    else window.localStorage.setItem(DRAFT_STORE, value);
  } catch {
    // Blocked storage: the draft still lives until the tab closes.
  }
}

/**
 * The effect lab: every cause in the effect layer on a control, beside the
 * real site.
 *
 * Laid out like an app builder, on request (Ony, 2026-09-29: "like the
 * Lovable app with the app preview"): the controls on the left, the actual
 * site in a frame on the right, any page of it, at desktop, tablet or phone
 * width. A change shows in the frame at once (lab-bridge posts the draft
 * into it). Nothing reaches visitors until **Save for everyone**, which
 * writes the site's tuning (SITE_TUNING_KEY in site_settings) -- the values
 * every visitor's browser applies. Until then the draft is kept in this
 * browser, and Discard goes back to what is live.
 *
 * Only causes have controls. The results physics sets from them (RESULTS in
 * tuning.ts) are not here to move.
 */
function Lab() {
  // The knobs are a plain mutable object, so React is only asked to redraw
  // the controls; the frame is sent the new values.
  const [, redraw] = useState(0);
  const bump = useCallback(() => redraw((n) => n + 1), []);

  const settings = useQuery(settingsQuery);
  const admin = useAdminStatus();
  const queryClient = useQueryClient();
  const canPublish = Boolean(admin.data?.isAdmin);
  const mode = useGlassMode();

  const frame = useRef<HTMLIFrameElement>(null);
  const [page, setPage] = useState<string>("/");
  const [framePath, setFramePath] = useState<string>("/");
  /*
   * The red room (item 39) in the preview: its switch in the frame's
   * address, and a request to go straight in once the frame is ready.
   */
  // The previews switched on (in this browser, so the whole site shows them to Ony).
  const [switchedOn, setSwitchedOn] = useState<ReadonlySet<PreviewName>>(
    () => new Set(storedPreviews()),
  );
  const redRoom = switchedOn.has("redroom");
  const flip = (name: PreviewName, on: boolean) => {
    setStoredPreview(name, on);
    setSwitchedOn(new Set(storedPreviews()));
    // The page reads them as it starts: reload it.
    setReloads((n) => n + 1);
  };
  // Descriptions under every control: folded away unless asked for (Ony, 2026-10-01).
  const [showHints, setShowHints] = useState(false);
  const enterRedRoomNext = useRef(false);
  const [reloads, setReloads] = useState(0);
  const [device, setDevice] = useState<Device>("desktop");
  const [query, setQuery] = useState("");
  /** What the preview's pointer holds (item 25h): the lamp until another is picked. */
  const [tool, setTool] = useState<ToolId>("lamp");
  const toolRef = useRef<ToolId>("lamp");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /** What is live for visitors, in the same shape as a draft. */
  const published = useRef<string | null>(null);

  // Start from what is published, then any draft left from last time.
  useEffect(() => {
    if (published.current !== null || settings.data === undefined) return;
    applySiteTuning(settings.data[SITE_TUNING_KEY]);
    published.current = savedTuning();
    const draft = readDraft();
    if (draft && draft !== published.current) {
      applySiteTuning(draft);
      toast.message("Your unsaved changes from last time are back", {
        description: "Discard goes back to what visitors see.",
      });
    }
    bump();
  }, [settings.data, bump]);

  const current = savedTuning();
  const loaded = published.current !== null;
  const dirty = loaded && current !== published.current;

  /*
   * Into the frame, at most once a frame: a slider drag fires far more
   * change events than there are frames to show them in.
   */
  const pending = useRef<number | null>(null);
  const push = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      sendLabDraft(frame.current, savedTuning(), getGlassMode());
    });
  }, []);

  // Keep the draft in this browser, and the frame in step, whenever it changes.
  useEffect(() => {
    if (!loaded) return;
    writeDraft(dirty ? current : null);
    push();
  }, [current, dirty, loaded, push]);

  // The frame says when it is ready for the draft, and where it has navigated.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFromFrame(event, frame.current)) return;
      const data = event.data;
      if (data.type === "onysnow:lab-ready") {
        setFramePath(data.path);
        if (published.current !== null) push();
        // A reloaded or navigated preview keeps the tool picked here.
        if (data.tool !== toolRef.current) sendLabHold(frame.current, toolRef.current);
        if (enterRedRoomNext.current) {
          enterRedRoomNext.current = false;
          // After its photographs have had a moment to load.
          window.setTimeout(() => sendLabRedRoom(frame.current), 600);
        }
      } else if (data.type === "onysnow:lab-path") {
        setFramePath(data.path);
      } else if (data.type === "onysnow:lab-tool" && isToolId(data.tool)) {
        // The page's own tray changed the hand: follow it.
        toolRef.current = data.tool;
        setTool(data.tool);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [push]);

  const set = useCallback(
    (key: string, value: number, inMode: TuningMode) => {
      if (!tuning[key] || !Number.isFinite(value)) return;
      setValueIn(key, inMode, value);
      setSaveState("idle");
      bump();
    },
    [bump],
  );

  const save = useCallback(async () => {
    if (!canPublish || !dirty) return;
    setSaveState("saving");
    const value = savedTuning();
    try {
      await saveSiteTuning(SITE_TUNING_KEY, value);
      published.current = value;
      writeDraft(null);
      setSaveState("saved");
      bump();
      void queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      toast.success("Saved — every visitor now sees the site this way");
    } catch {
      setSaveState("error");
      toast.error("Could not save for everyone — are you signed in as the admin?");
    }
  }, [canPublish, dirty, queryClient, bump]);

  const discard = useCallback(() => {
    applySiteTuning(settings.data?.[SITE_TUNING_KEY]);
    published.current = savedTuning();
    writeDraft(null);
    setSaveState("idle");
    bump();
    toast.success("Back to what visitors see");
  }, [settings.data, bump]);

  // Ctrl/Cmd+S saves, as it does in every editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // The preview skips the site's opening curtain; it has been seen.
  const src = useMemo(() => {
    try {
      window.sessionStorage.setItem("onysnow:loaded", "1");
    } catch {
      // The curtain then plays once in the frame. Harmless.
    }
    return `${page}?glass=${getGlassMode()}`;
    // The mode is sent by message after this; changing it must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, reloads]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, [string, Knob][]>();
    for (const group of GROUP_ORDER) byGroup.set(group, []);
    for (const entry of Object.entries(tuning)) {
      // Results have no control: physics sets them (RESULTS in tuning.ts).
      if (isResult(entry[0])) continue;
      const list = byGroup.get(entry[1].group) ?? [];
      list.push(entry);
      byGroup.set(entry[1].group, list);
    }
    // A section with neither a control nor a switch has nothing to show.
    return [...byGroup.entries()].filter(
      ([group, list]) => list.length > 0 || previewsIn(group).length > 0,
    );
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = ([key, knob]: [string, Knob]) =>
    !needle ||
    knob.label.toLowerCase().includes(needle) ||
    key.toLowerCase().includes(needle) ||
    knob.group.toLowerCase().includes(needle) ||
    (knob.hint?.toLowerCase().includes(needle) ?? false);

  const status = canPublish
    ? saveState === "saving"
      ? "Saving for everyone…"
      : saveState === "error"
        ? "Not saved. Check you are signed in as the admin."
        : dirty
          ? "Unsaved changes — only you see them, in the preview."
          : saveState === "saved"
            ? "Saved — this is how every visitor sees the site."
            : "This is what every visitor sees."
    : "Sign in as the admin to save these for every visitor. Until then, changes are only in this browser.";

  const width = DEVICES[device].width;

  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      {/* ── The bar: where you are, what the preview shows, and publishing. */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin" aria-label="Back to the Studio">
            <ArrowLeft />
            Studio
          </Link>
        </Button>
        <span className="mr-2 text-sm font-medium">Effect lab</span>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <label htmlFor="lab-page" className="sr-only">
            Page shown in the preview
          </label>
          <select
            id="lab-page"
            value={PAGES.some((p) => p.path === framePath) ? framePath : ""}
            onChange={(e) => {
              if (!e.target.value) return;
              setPage(e.target.value);
              setFramePath(e.target.value);
              setReloads((n) => n + 1);
            }}
            className="h-8 max-w-[14rem] rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {PAGES.some((p) => p.path === framePath) ? null : <option value="">{framePath}</option>}
            {PAGES.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
          <span
            className="hidden min-w-0 truncate rounded-md border border-border/60 px-2 py-1 font-mono text-xs text-muted-foreground md:block"
            data-lab-path
          >
            {framePath}
          </span>
          <IconButton label="Reload the preview" onClick={() => setReloads((n) => n + 1)}>
            <RefreshCw />
          </IconButton>
          <IconButton
            label="Open this page in a new tab (shows what visitors see)"
            onClick={() => window.open(framePath, "_blank", "noopener")}
          >
            <ExternalLink />
          </IconButton>
          <div className="ml-2 hidden items-center rounded-md border border-border/60 sm:flex">
            {(Object.keys(DEVICES) as Device[]).map((d) => {
              const Icon = DEVICES[d].icon;
              return (
                <IconButton
                  key={d}
                  label={DEVICES[d].label}
                  pressed={device === d}
                  onClick={() => setDevice(d)}
                >
                  <Icon />
                </IconButton>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = toggleGlassMode();
              bump();
              push();
              toast.success(next === "raster" ? "Liquid glass" : "CSS glass");
            }}
            title="Which glass the preview runs. Some controls are kept separately for each."
          >
            <Layers /> {mode === "raster" ? "Liquid glass" : "CSS glass"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-lab-redroom
            onClick={() => {
              if (redRoom) {
                // Already switched on in the frame: straight in.
                sendLabRedRoom(frame.current);
              } else {
                enterRedRoomNext.current = true;
                flip("redroom", true);
              }
            }}
            title="Secret 2, the red room (?try=redroom): the preview goes dark but for the safelight, with the photograph most in view hanging on the line. Lights on or Escape leaves; winding the shutter and clicking a photograph gets back in."
          >
            Red room
          </Button>
          <label htmlFor="lab-tool" className="sr-only">
            What the pointer holds in the preview
          </label>
          <select
            id="lab-tool"
            data-lab-tool
            value={tool}
            onChange={(e) => {
              if (!isToolId(e.target.value)) return;
              toolRef.current = e.target.value;
              setTool(e.target.value);
              sendLabHold(frame.current, e.target.value);
            }}
            title="What the pointer holds in the preview (the hammer breaks the pane you strike). Only the preview: visitors keep the lamp."
            className="h-8 w-[8.5rem] flex-none rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <p
          className="hidden max-w-[18rem] text-right text-xs text-muted-foreground xl:block"
          data-lab-save={saveState}
          data-lab-dirty={dirty ? "yes" : "no"}
        >
          {status}
        </p>
        <Button variant="ghost" size="sm" onClick={discard} disabled={!dirty}>
          <Undo2 /> Discard
        </Button>
        {canPublish ? (
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || saveState === "saving"}
            data-lab-publish
          >
            <Upload /> Save for everyone
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">Sign in to save</Link>
          </Button>
        )}
      </header>
      {/* The status, for widths the bar has no room for it at. */}
      <p className="border-b border-border/60 px-3 py-1 text-xs text-muted-foreground xl:hidden">
        {status}
      </p>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        {/* ── The controls. */}
        <aside className="flex min-h-0 flex-1 flex-col border-border/60 lg:w-[23rem] lg:flex-none lg:border-r">
          <div className="space-y-2 border-b border-border/60 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a control"
                aria-label="Find a control"
                className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetTuning(TUNING_DEFAULTS);
                  setSaveState("idle");
                  bump();
                  toast.success("Every control back to the source's value (not saved yet)");
                }}
                title="Every control back to the value in the source. Not saved until you save."
              >
                <RotateCcw /> Source values
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
                aria-pressed={showHints}
                onClick={() => setShowHints((v) => !v)}
                title="Show or hide the description under every control (each has its own (i) too)"
              >
                <Info /> {showHints ? "Hide descriptions" : "Show descriptions"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Causes only: the {Object.keys(RESULTS).length} results physics sets from these have no
              control. Most do nothing until the pointer&rsquo;s light is on the glass.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3" data-lab-controls>
            {groups.map(([group, all]) => {
              const knobs = all.filter(matches);
              const switches = previewsIn(group).filter(
                (name) =>
                  !needle ||
                  PREVIEW_TITLES[name].toLowerCase().includes(needle) ||
                  PREVIEWS[name].toLowerCase().includes(needle) ||
                  name.includes(needle),
              );
              if (knobs.length === 0 && switches.length === 0) return null;
              const dead =
                all.length > 0 &&
                all.every((entry) => entry[1].modes === "raster") &&
                mode !== "raster";
              const twinned = all.some((entry) => isPerMode(entry[1]));
              const other: TuningMode = mode === "raster" ? "css" : "raster";
              const moved = all.filter(
                ([key]) => valueIn(key, mode) !== TUNING_DEFAULTS[key],
              ).length;

              const rows = (inMode: TuningMode, prefix: string) => (
                <div className="space-y-4">
                  {knobs.map(([key, knob]) => (
                    <KnobRow
                      key={key}
                      id={`knob-${prefix}${key}`}
                      knob={knob}
                      value={valueIn(key, inMode)}
                      source={TUNING_DEFAULTS[key] ?? knob.value}
                      onChange={(value) => set(key, value, inMode)}
                      showHint={showHints}
                    />
                  ))}
                </div>
              );

              return (
                <details
                  key={group}
                  open={Boolean(needle) || !dead}
                  className={cn(
                    "mb-3 rounded-lg border border-border/60",
                    group === "Liquid glass" && !dead && "border-[var(--amber)]/30",
                  )}
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>
                      {GROUP_TITLES[group] ?? group}
                      {twinned ? (
                        <span className="ml-2 normal-case tracking-normal text-[var(--amber)]">
                          {mode === "raster" ? "liquid" : "CSS"} set
                        </span>
                      ) : null}
                    </span>
                    <span className="normal-case tracking-normal">
                      {dead ? "liquid glass only" : moved ? `${moved} changed` : ""}
                    </span>
                  </summary>
                  <div className="px-3 pb-4 pt-1">
                    {switches.length ? (
                      <div className="mb-4 space-y-2 rounded-md bg-muted/40 p-2" data-lab-switches>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          Not approved yet — switch on to try
                        </p>
                        {switches.map((name) => (
                          <PreviewSwitch
                            key={name}
                            name={name}
                            on={switchedOn.has(name)}
                            showHint={showHints}
                            onChange={(on) => flip(name, on)}
                          />
                        ))}
                      </div>
                    ) : null}
                    {dead ? (
                      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                        These drive the liquid glass shader and do nothing to CSS glass. Switch the
                        glass (top bar) to see them work.
                      </p>
                    ) : group === "Liquid glass" ? (
                      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                        Edge width (under Glass shape) has the most leverage here: across the flat
                        face the surface normal is straight out, so refraction and every specular
                        are zero there. All of this glass lives on the edge.
                      </p>
                    ) : null}
                    <div className={dead ? "opacity-60" : undefined}>{rows(mode, "")}</div>
                    {twinned ? (
                      <details className="mt-5 rounded-md border border-border/60 p-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          The {other === "raster" ? "liquid" : "CSS"} glass set — not on screen
                        </summary>
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          This group keeps separate values for each glass. These apply when the
                          preview runs the other one.
                        </p>
                        <Button
                          className="mt-2 mb-4"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            for (const [key, knob] of all) {
                              if (isPerMode(knob)) setValueIn(key, other, valueIn(key, mode));
                            }
                            bump();
                            toast.success(
                              `Copied this set to ${other === "raster" ? "liquid" : "CSS"}`,
                            );
                          }}
                        >
                          <Copy /> Copy the live set over these
                        </Button>
                        <div className="opacity-70">{rows(other, `${other}-`)}</div>
                      </details>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </aside>

        {/* ── The site, live. */}
        <section
          aria-label="Preview"
          className="flex min-h-[55vh] flex-1 items-stretch justify-center overflow-auto bg-muted/30 lg:min-h-0"
        >
          <iframe
            key={reloads}
            ref={frame}
            src={src}
            title="Preview of the site with these settings"
            data-lab-preview
            className={cn(
              "h-full min-h-[55vh] border-0 bg-background lg:min-h-0",
              width === null ? "w-full" : "my-3 rounded-lg shadow-lg ring-1 ring-border/60",
            )}
            style={width === null ? undefined : { width, flex: "none" }}
          />
        </section>
      </div>
    </main>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-8", pressed && "bg-accent text-accent-foreground")}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** One control, bound to a given mode's copy of its value. */
function KnobRow({
  id,
  knob,
  value,
  source,
  onChange,
  showHint,
}: {
  id: string;
  knob: Knob;
  value: number;
  source: number;
  onChange: (value: number) => void;
  showHint: boolean;
}) {
  const moved = value !== source;
  const [open, setOpen] = useState(false);
  const hintShown = Boolean(knob.hint) && (showHint || open);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex min-w-0 items-center gap-1.5 text-sm">
          {moved ? (
            <span
              className="size-1.5 flex-none rounded-full bg-[var(--amber)]"
              aria-label="changed from the source"
            />
          ) : null}
          <span className="truncate">{knob.label}</span>
        </label>
        <div className="flex flex-none items-center gap-1">
          {knob.hint ? (
            <button
              type="button"
              className={cn(
                "rounded p-1 text-muted-foreground hover:text-foreground",
                hintShown && "text-foreground",
              )}
              aria-label={`${knob.label}: what it does`}
              aria-expanded={hintShown}
              title="What it does"
              onClick={() => setOpen((v) => !v)}
            >
              <Info className="size-3" />
            </button>
          ) : null}
          {moved ? (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={`${knob.label}: back to the source's value, ${source}`}
              title={`Back to ${source}`}
              onClick={() => onChange(source)}
            >
              <RotateCcw className="size-3" />
            </button>
          ) : null}
          {knob.options ? null : (
            <input
              type="number"
              aria-label={`${knob.label} value`}
              min={knob.min}
              max={knob.max}
              step={knob.step}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right font-mono text-xs"
            />
          )}
        </div>
      </div>
      {knob.options ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {knob.options.map((label, i) => (
            <option key={label} value={knob.min + i * knob.step}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="range"
          min={knob.min}
          max={knob.max}
          step={knob.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-full accent-[var(--amber)]"
        />
      )}
      {hintShown ? <p className="text-xs leading-snug text-muted-foreground">{knob.hint}</p> : null}
    </div>
  );
}

/**
 * The sections, in the order they are worth reaching for, and what each is
 * called here. The cursor first: it is the hand everything else answers.
 */
const GROUP_ORDER = [
  "Cursor",
  "Light",
  "Environment",
  "Reflection",
  "Glass shape",
  "Glass",
  "Shadows",
  "Camera",
  "Lens flare",
  "Afterimage",
  "Liquid glass",
  "Site",
] as const;

const GROUP_TITLES: Record<string, string> = {
  Cursor: "Cursor & what you hold",
  Light: "The lamp",
  Environment: "Room & backlight",
  Reflection: "Reflection",
  "Glass shape": "Glass shape",
  Glass: "Glass",
  Shadows: "Shadows & light through the glass",
  Camera: "Camera",
  "Lens flare": "Lens flare",
  Afterimage: "Afterimage",
  "Liquid glass": "Liquid glass",
  Site: "Site & secrets",
};

/** Every ?try= preview as a switch, in the section it belongs to. */
const PREVIEW_GROUP: Record<PreviewName, (typeof GROUP_ORDER)[number]> = {
  tools: "Cursor",
  flashlight: "Cursor",
  magnifier: "Cursor",
  flare: "Cursor",
  laser: "Cursor",
  blacklight: "Cursor",
  kelvin: "Light",
  flash: "Light",
  photolights: "Light",
  backlight: "Environment",
  dimroom: "Reflection",
  satin: "Reflection",
  coating: "Glass",
  marks: "Glass",
  roughglass: "Glass",
  corners: "Glass shape",
  contact: "Glass",
  broken: "Glass",
  shardlight: "Glass",
  solids: "Glass",
  shaderplastic: "Glass",
  castshadows: "Shadows",
  bounce: "Shadows",
  gapparallax: "Shadows",
  polariser: "Camera",
  vignette: "Camera",
  burn: "Camera",
  liquidlights: "Liquid glass",
  liquidedge: "Liquid glass",
  quality: "Site",
  redroom: "Site",
};

/** A short name for each preview; its full description is PREVIEWS[name]. */
const PREVIEW_TITLES: Record<PreviewName, string> = {
  tools: "Tool tray (pick what you hold)",
  flashlight: "Flashlight",
  magnifier: "Magnifying glass",
  flare: "Road flare",
  laser: "Laser pointer",
  blacklight: "Black light (UV)",
  kelvin: "Lamp colour from temperature",
  flash: "Shutter flash lights the scene",
  photolights: "Photographs' own lights",
  backlight: "Backlight under the glass",
  dimroom: "Room lamps rolled off",
  satin: "Satin front face",
  coating: "Museum and opal glass (Lab samples)",
  marks: "Smudges and scratches by coverage",
  roughglass: "Frost from microfacets",
  corners: "Rounded bevel corners",
  contact: "Panes resting on each other (Newton's rings)",
  broken: "Broken glass (Lab samples)",
  shardlight: "Broken pieces reflect the room",
  solids: "Glass solids (Lab samples)",
  shaderplastic: "Buttons lit by the glass shader",
  castshadows: "Shadows through the glass, per letter",
  bounce: "Bounce light from the photographs",
  gapparallax: "Parallax from each pane's gap",
  polariser: "Polarising filter",
  vignette: "Lens vignetting",
  burn: "Film burn on bright light",
  liquidlights: "Liquid glass lit by the scene only",
  liquidedge: "Liquid glass edges like CSS",
  quality: "Quality tiers for slow devices",
  redroom: "The red room (secret 2)",
};

function previewsIn(group: string): PreviewName[] {
  return (Object.keys(PREVIEW_GROUP) as PreviewName[]).filter((n) => PREVIEW_GROUP[n] === group);
}

/** One preview's switch. */
function PreviewSwitch({
  name,
  on,
  showHint,
  onChange,
}: {
  name: PreviewName;
  on: boolean;
  showHint: boolean;
  onChange: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `preview-${name}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 flex-none accent-[var(--amber)]"
            data-lab-preview-switch={name}
          />
          <span className="truncate">{PREVIEW_TITLES[name]}</span>
        </label>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={`${PREVIEW_TITLES[name]}: what it does`}
          aria-expanded={showHint || open}
          onClick={() => setOpen((v) => !v)}
        >
          <Info className="size-3" />
        </button>
      </div>
      {showHint || open ? (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{PREVIEWS[name]}</p>
      ) : null}
    </div>
  );
}
