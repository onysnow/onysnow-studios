import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";
import { safeCustomCss, safeHref } from "@/lib/safe-content";
import { SITE_ASSETS } from "@/lib/site-assets";
import { loadSavedTuning } from "@/lib/tuning";

/** Display faces the portal can switch between. */
const FONTS = new Set(["jost", "inter-tight", "barlow-condensed"]);

/**
 * The headline size multiplier, as the slider writes it.
 *
 * This was a lookup keyed by "small" / "default" / "large", but the portal
 * renders a continuous slider over 0.8-1.3 and stores something like "1.12", so
 * every lookup missed and the value was always 1. The slider is the better
 * control, so the reader was the half worth changing. Clamped to the slider's
 * own range, because the stored value is just text and nothing else bounds it.
 */
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.3;

function displayScale(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)));
}

/**
 * Applies the studio's saved theme settings: the display font, the headline
 * scale, and any custom CSS.
 *
 * The CSS is capped and filtered on the way in -- see `safeCustomCss`, which
 * explains what it removes and why the previous filter did not actually do
 * what its comment claimed. It is admin-authored, so the risk is low, but this
 * renders on every page of the public site, which makes it the widest blast
 * radius in the codebase and worth bounding properly.
 */
export function CustomCss() {
  const { data } = useQuery(settingsQuery);

  const font = (data?.["display_font"] ?? "").trim().toLowerCase();
  const scale = (data?.["display_scale"] ?? "").trim().toLowerCase();

  /*
   * Asset URLs go on the document too.
   *
   * The pieces that load them -- the glass shader's surface map, the cursor
   * light's -- are WebGL initialisers that run once and then own an rAF loop.
   * They are not subscribed to anything and should not become so; publishing
   * here keeps the effect layer ignorant of React Query, which is the
   * arrangement everything else in it already has.
   *
   * Only `safeHref` values are written. A settings row is studio-editable
   * text that ends up in an <img> src, so it gets the same treatment as any
   * other URL out of the portal.
   */
  const glassSurface = safeHref(data?.[SITE_ASSETS.glassSurface.key] ?? "");

  /*
   * Whatever the lab last saved, applied to the real site.
   *
   * Here rather than in its own component because this is already the place
   * that reads studio settings and writes them onto the document, and it is
   * already mounted on every route. Once, on mount: the lab applies its own
   * changes live while you are in it, and re-applying on every render would
   * fight that.
   */
  useEffect(() => {
    // The panes carry `suppressHydrationWarning` precisely so this does not
    // have to be timed against hydration -- see Glass.tsx.
    loadSavedTuning();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (FONTS.has(font) && font !== "jost") root.setAttribute("data-display-font", font);
    else root.removeAttribute("data-display-font");

    root.style.setProperty("--display-scale", displayScale(scale));

    if (glassSurface) root.dataset[SITE_ASSETS.glassSurface.attr] = glassSurface;
    else delete root.dataset[SITE_ASSETS.glassSurface.attr];
  }, [font, scale, glassSurface]);

  const css = safeCustomCss(data?.["custom_css"]);
  if (!css.trim()) return null;

  return <style data-custom-css="true" dangerouslySetInnerHTML={{ __html: css }} />;
}
