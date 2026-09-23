import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";
import { safeCustomCss } from "@/lib/safe-content";

/** Display faces the portal can switch between. */
const FONTS = new Set(["jost", "inter-tight", "barlow-condensed"]);

/** Headline size multipliers, applied as a CSS variable. */
const SCALES: Record<string, string> = { small: "0.9", default: "1", large: "1.12" };

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

    root.style.setProperty("--display-scale", SCALES[scale] ?? "1");
  }, [font, scale]);

  const css = safeCustomCss(data?.["custom_css"]);
  if (!css.trim()) return null;

  return <style data-custom-css="true" dangerouslySetInnerHTML={{ __html: css }} />;
}
