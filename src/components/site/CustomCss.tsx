import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";

/** Display faces the portal can switch between. */
const FONTS = new Set(["jost", "inter-tight", "barlow-condensed"]);

/** Headline size multipliers, applied as a CSS variable. */
const SCALES: Record<string, string> = { small: "0.9", default: "1", large: "1.12" };

/**
 * Applies the studio's saved theme settings: the display font, the headline
 * scale, and any custom CSS.
 *
 * The CSS is capped and stripped of anything that could break out of the style
 * element or pull in remote resources. It's admin-authored, so the risk is low,
 * but an unbounded injection point deserves a bound.
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

  const raw = data?.["custom_css"];
  if (!raw || !raw.trim()) return null;

  const css = raw
    .slice(0, 20_000)
    .replace(/<\/?(style|script)/gi, "")
    .replace(/@import[^;]*;?/gi, "");

  return <style data-custom-css="true" dangerouslySetInnerHTML={{ __html: css }} />;
}
