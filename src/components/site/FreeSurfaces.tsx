import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { registerLitSurface } from "@/effects/scene/scene";

/** How far type and a button stand off the photograph they are over (as on glass: components/site/Glass). */
const TYPE_STANDOFF = 0.42;
const PLASTIC_STANDOFF = 0.5;

/**
 * The copy and buttons that stand over a photograph rather than on a pane --
 * the hero's -- lit like those on the panes (item 52; Ony,
 * 2026-10-01: "None of these elements have dynamic shadows nor plastic
 * sheen"): the buttons catch the lamp, and everything throws its shadow onto
 * the photograph (effects/optics/casters).
 */
export function FreeSurfaces() {
  const location = useLocation();
  useEffect(() => {
    let releases: (() => void)[] = [];
    // After the page's own content has rendered.
    const timer = window.setTimeout(() => {
      for (const node of document.querySelectorAll<HTMLElement>(
        "[data-photo] :is(h1, h2, h3, p, .plastic, a)",
      )) {
        if (node.closest(".glass")) continue;
        // A link inside a heading or a button is that heading's or button's.
        if (node.parentElement?.closest(".plastic, h1, h2, h3, p")) continue;
        const plastic = node.classList.contains("plastic");
        const dark = node.classList.contains("plastic--dark");
        releases.push(
          registerLitSurface(node, {
            occludes: false,
            standoff: plastic ? PLASTIC_STANDOFF : TYPE_STANDOFF,
            material: plastic && !dark ? "dayglo-orange" : "ink",
          }),
        );
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      for (const stop of releases) stop();
      releases = [];
    };
  }, [location.pathname]);
  return null;
}
