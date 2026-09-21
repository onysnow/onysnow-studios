import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";

/**
 * Injects the studio's saved custom CSS. Rendered last in the document so it
 * can override the design system without a rebuild. A malformed value simply
 * has no effect — the browser ignores invalid rules.
 */
export function CustomCss() {
  const { data } = useQuery(settingsQuery);
  const css = data?.["custom_css"];
  if (!css || !css.trim()) return null;
  return <style data-custom-css="true" dangerouslySetInnerHTML={{ __html: css }} />;
}
