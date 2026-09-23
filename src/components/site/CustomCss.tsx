import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";
import { safeCustomCss } from "@/lib/safe-content";

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

  useEffect(() => {
    const root = document.documentElement;
    if (FONTS.has(font) && font !== "jost") root.setAttribute("data-display-font", font);
    else root.removeAttribute("data-display-font");

    root.style.setProperty("--display-scale", displayScale(scale));
  }, [font, scale]);

  const css = safeCustomCss(data?.["custom_css"]);
  if (!css.trim()) return null;

  return <style data-custom-css="true" dangerouslySetInnerHTML={{ __html: css }} />;
}
