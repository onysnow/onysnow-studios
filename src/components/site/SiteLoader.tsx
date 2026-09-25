import { useEffect, useRef, useState } from "react";

import { ScrambleText } from "./ScrambleText";
import { useRouter } from "@tanstack/react-router";

import { whenFirstScreenReady } from "@/lib/page-ready";
import { warmSite } from "@/lib/warm-up";

/**
 * The shutter winding, while the first screen loads -- and something to do
 * while it does.
 *
 * WHY IT IS NOT A SPINNER
 *
 * A loading screen is dead time by definition, so the only question worth
 * asking is what to spend it on. This spends it demonstrating the thing the
 * site is actually made of: real `.glass` panes, lit by the real cursor light,
 * with the real pointer over them. Nothing here is a mock-up of the effect --
 * the panes carry the same class the site's own panels do, so the pane-light
 * registers them and lights them by the same code path. The wait becomes the
 * first thing you play with rather than the thing between you and the site.
 *
 * That is also why this sits at z-index 9990 rather than above everything: the
 * cursor and its light layers live at 9997-9999, so dropping below them lets
 * them paint over the loader. Above them, the panes would be unlit and the
 * pointer invisible, and the whole idea would be a picture of itself.
 *
 * WHY `--wind` DRIVES EVERYTHING
 *
 * `--wind` is the charge, in one number: the ring opens with it, the aperture
 * derives from the ring so it follows, and the lamp reddens and blooms with
 * it. One keyframe on that variable animates the entire charge sequence up and
 * back down, with no second set of keyframes to drift out of sync.
 *
 * SILENT, AND NO GRAIN
 *
 * The real charge has a sound -- an 18 kHz capacitor whine cut from a
 * recording of one. It is not played here, and nothing draws generated noise.
 *
 * FIRST HARD LOAD ONLY
 *
 * sessionStorage, so a refresh in the same visit does not re-show it and route
 * changes never do. Markup is identical on server and client and only an
 * effect hides it, so there is no hydration mismatch.
 */

const SEEN = "onysnow:loaded";

/**
 * What it says while it works.
 *
 * Cycled rather than fixed, because the scramble is the site's own title
 * treatment and a word that resolves and then sits there wastes it. Each one
 * is a real thing the page is doing, in the order it does them, so the text
 * is honest about the wait rather than decorative.
 */
const WORDS = ["Loading", "Metering", "Focusing", "Developing"] as const;
const WORD_MS = 1900;

/**
 * The warm-up gets this long, then you are let in regardless of what is still
 * outstanding. Longer than page-ready's own deadline because it is doing far
 * more -- every page's code and data, every photograph on this one -- but
 * still finite: a loader that can hang is a site that can be unreachable.
 */
const WARM_DEADLINE_MS = 10000;

/**
 * Never open onto "Click to enter" before the first word has finished
 * scrambling. On a fast connection the warm-up can finish in a few hundred
 * milliseconds, and a loader that flashes its ready state before you have seen
 * it do anything reads as broken rather than fast.
 */
const MIN_HOLD_MS = WORD_MS;

function alreadySeen() {
  try {
    return sessionStorage.getItem(SEEN) === "1";
  } catch {
    // Private mode or blocked storage. Showing the loader again is the
    // harmless failure; refusing to show the page is not.
    return false;
  }
}

function remember() {
  try {
    sessionStorage.setItem(SEEN, "1");
  } catch {
    /* nothing to remember it with */
  }
}

export function SiteLoader() {
  /*
   * Four states, and the order matters:
   *   holding  the first screen is still arriving
   *   ready    it has arrived; waiting to be let in
   *   leaving  fading out
   *   gone     unmounted
   *
   * Starts holding on both server and client, so the very first paint is the
   * loader rather than a half-built page.
   */
  const [state, setState] = useState<"holding" | "ready" | "leaving" | "gone">("holding");
  const [word, setWord] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (alreadySeen() || reduced) {
      setState("gone");
      return;
    }

    let live = true;
    const started = performance.now();
    const deadline = new Promise<"deadline">((resolve) =>
      window.setTimeout(() => resolve("deadline"), WARM_DEADLINE_MS),
    );
    const floor = new Promise<void>((resolve) => window.setTimeout(resolve, MIN_HOLD_MS));

    /*
     * The first screen and the warm-up run side by side, not one after the
     * other: the warm-up is mostly network and the first screen mostly decode,
     * so overlapping them costs nothing and saves the whole of the shorter one.
     */
    const work = Promise.all([whenFirstScreenReady(), warmSite(router)]);

    void Promise.all([Promise.race([work, deadline]), floor]).then(([outcome]) => {
      if (!live) return;
      setState("ready");
      if (import.meta.env.DEV) {
        const ms = Math.round(performance.now() - started);
        if (outcome === "deadline") {
          console.info(`[loader] ready after ${ms}ms (deadline hit — revealed anyway)`);
        } else {
          const [screen, warm] = outcome;
          console.info(
            `[loader] ready after ${ms}ms: ${screen.images} above-the-fold images, ` +
              `${warm.done}/${warm.total} warm-up tasks`,
          );
        }
      }
    });

    return () => {
      live = false;
    };
  }, [router]);

  // Cycle the word only while there is still something to wait for.
  useEffect(() => {
    if (state !== "holding") return;
    const id = window.setInterval(() => setWord((n) => (n + 1) % WORDS.length), WORD_MS);
    return () => window.clearInterval(id);
  }, [state]);

  /*
   * Enter from the keyboard without focusing the button.
   *
   * It used to be `autoFocus`, which Chrome treats as keyboard focus and so
   * drew the focus ring round it on every load: a box round "Click to enter"
   * that nobody put there. The button is still in the tab order for anyone
   * tabbing to it; this just lets Enter work without the ring.
   */
  useEffect(() => {
    if (state !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      remember();
      setState("leaving");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // Unmount once the fade has finished, so nothing pops.
  useEffect(() => {
    if (state !== "leaving") return;
    const el = host.current;
    if (!el) {
      setState("gone");
      return;
    }
    const done = () => setState("gone");
    el.addEventListener("transitionend", done, { once: true });
    // Belt and braces: a transition that never fires -- backgrounded tab,
    // display change -- must not leave the overlay sitting on the page.
    const bail = window.setTimeout(done, 1200);
    return () => {
      el.removeEventListener("transitionend", done);
      window.clearTimeout(bail);
    };
  }, [state]);

  if (state === "gone") return null;

  /*
   * Remembered at the moment you are let in -- not when the page becomes
   * ready. Someone who reloads while still looking at "Ready" never actually
   * entered, and showing them the loader again is correct.
   *
   * This call went missing once already. The first version of this component
   * remembered on reveal; rewriting it for click-to-enter kept `remember()`
   * defined and dropped every call to it, so the flag was never written and
   * every load of every page looked like a first visit. e2e/loader.spec.ts
   * now reloads after entering and fails if the loader comes back.
   */
  const enter = () => {
    if (state !== "ready") return;
    remember();
    setState("leaving");
  };

  return (
    <div ref={host} className="site-loader" data-state={state} role="status" aria-label="Loading">
      {/*
        Something for the light to fall on. A sheet of glass over a flat
        colour shows nothing -- glass is only visible by what it does to what
        is behind it -- so the backdrop carries a gradient for the panes to
        bend and the light to catch.
      */}
      <div className="site-loader__field" aria-hidden="true" />

      <div className="site-loader__stage">
        {/*
          Real panes, not a picture of them: `.glass` is the same class the
          site's own panels use, so the pane-light registers these and the
          cursor lights them exactly as it lights the page underneath.

          No instructions anywhere. Anyone who moves the pointer finds the
          light on their own, and being told to is worse than not finding it
          -- a caption explaining an effect is an admission the effect did
          not carry itself.
        */}
        <div className="glass site-loader__pane" aria-hidden="true" />
        <div className="glass site-loader__pane" aria-hidden="true" />

        {/* The word lives ON the glass, centred in the pane it sits on. */}
        <div className="glass site-loader__pane site-loader__pane--wide">
          <div className="site-loader__readout">
            {/*
              Keyed on the word so React remounts it: ScrambleText runs its
              sequence on mount, and without a new key it would swap the text
              without ever scrambling it.
            */}
            <p className="site-loader__word">
              <ScrambleText
                key={state === "holding" ? WORDS[word] : "ready"}
                text={state === "holding" ? (WORDS[word] ?? "Loading") : "Ready"}
                startOnView={false}
                totalMs={900}
              />
            </p>

            {/*
              A real <button>, not a click handler on the overlay: this is the
              only way past the loader, so it has to be reachable by keyboard
              and announced as the control it is.
            */}
            {state === "ready" ? (
              <button type="button" className="site-loader__enter eyebrow" onClick={enter}>
                Click to enter
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
