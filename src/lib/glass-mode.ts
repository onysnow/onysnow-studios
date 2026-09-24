import { useEffect, useState } from "react";

/**
 * Which glass is running.
 *
 * Two complete systems live in this repo and that is deliberate for now:
 *
 *   css     backdrop-filter, an SVG displacement map per pane geometry, and
 *           the WebGL light pass. What ships.
 *   raster  ybouane/liquidglass: the page rasterised into a texture and
 *           sampled by a refraction shader, which is the only way to bend
 *           what is behind the pane rather than merely blur it.
 *
 * Chosen with `?glass=raster` and remembered, so a reload or a walk around the
 * site keeps the mode without the query string having to be carried. Comparing
 * them is the entire point; a build flag would mean rebuilding to switch, and
 * nobody compares two things they have to rebuild between.
 */

const KEY = "onysnow:glass-mode";

export type GlassMode = "css" | "raster";

function readMode(): GlassMode {
  if (typeof window === "undefined") return "css";

  // The query string wins, and writes through, so a shared link pins the mode.
  const asked = new URLSearchParams(window.location.search).get("glass");
  if (asked === "raster" || asked === "css") {
    try {
      window.localStorage.setItem(KEY, asked);
    } catch {
      // Private mode, blocked storage. The query string still applies to this
      // page; it just will not survive a navigation.
    }
    return asked;
  }

  try {
    return window.localStorage.getItem(KEY) === "raster" ? "raster" : "css";
  } catch {
    return "css";
  }
}

/**
 * True when the rasterised glass should run.
 *
 * Always false on the first render, including on the server. The mode lives in
 * the query string and in localStorage, neither of which the server can see,
 * so deciding during render would mean the markup React produced and the
 * markup it hydrated disagreed — and a hydration mismatch on the root is how
 * this site spent a whole session with a console error nobody could place.
 * It settles in an effect instead, one frame later, which for a comparison
 * toggle is free.
 */
export function useRasterGlass(): boolean {
  const [raster, setRaster] = useState(false);
  useEffect(() => {
    setRaster(readMode() === "raster");
  }, []);
  return raster;
}
