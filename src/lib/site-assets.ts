/**
 * Files the effect layer loads, and where they actually come from.
 *
 * These used to be string literals in the components that loaded them --
 * `img.src = "/glass-surface.jpg"` in two separate files, and a hardcoded
 * array of room names inlined into a script string. Changing any of them
 * meant editing source and redeploying, which put the look of the glass
 * permanently out of reach of the person whose glass it is.
 *
 * Now each is a settings row the studio can upload to. The shipped file stays
 * as the fallback, so an empty setting is not a broken site -- it is the
 * default, which is also what "Reset to default" leaves behind.
 *
 * WHY A DATA ATTRIBUTE AND NOT A HOOK
 *
 * The consumers are WebGL initialisers inside effects that run once and then
 * own an rAF loop; they are not subscribed to anything and should not be.
 * `CustomCss` already reads the settings and writes to the document element,
 * so one more attribute costs nothing and keeps the effect layer ignorant of
 * React Query, which is the arrangement the rest of it already has.
 */

export const SITE_ASSETS = {
  /** The smudge and scratch map the glass shader and cursor light sample. */
  glassSurface: { key: "glass_surface_url", attr: "glassSurface", fallback: "/glass-surface.jpg" },
} as const;

/**
 * Where to load an asset from right now.
 *
 * Falls back on an empty or whitespace value as well as a missing one: a
 * settings row cleared in the portal stores "", and treating that as a URL
 * would ask the browser to fetch the current page as an image.
 */
export function assetUrl(asset: (typeof SITE_ASSETS)[keyof typeof SITE_ASSETS]): string {
  if (typeof document === "undefined") return asset.fallback;
  const set = document.documentElement.dataset[asset.attr];
  return set && set.trim() ? set : asset.fallback;
}
