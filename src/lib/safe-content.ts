/**
 * Bounding the parts of the site the studio can author, with no dependencies.
 *
 * Deliberately separate from safe-html.ts. That module pulls in
 * `sanitize-html`, which measured at +48 kB gzipped on the entry chunk -- and
 * these two functions are needed on every public page, while a full HTML
 * sanitizer is not. Importing one from the other would put the whole parser on
 * the critical path of the home page of a photography site.
 */

/**
 * Admin-configured URLs — the booking link, the social rail, the contact block.
 *
 * These are rendered straight into `href`, where `javascript:` is a click away
 * from running as the visitor. A scheme that isn't on the list yields an empty
 * string, so the caller can decide whether to render the link at all rather
 * than emit a live one it can't vouch for.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

export function safeHref(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Relative, root-relative, anchor and query links have no scheme to abuse.
  if (/^[./#?]/.test(trimmed)) return trimmed;

  return SAFE_SCHEME.test(trimmed) ? trimmed : "";
}

/**
 * The studio's custom CSS, on its way into a `<style>` element.
 *
 * The filter this replaces did two `.replace()` passes and a comment claiming
 * the result was "stripped of anything that could break out of the style
 * element or pull in remote resources." Neither half held.
 *
 * `.replace()` is a single pass, so removing a match lets its neighbours
 * re-join behind the scanner. `</st</styleyle>` has `</style` removed from the
 * middle and the two ends meet as a real `</style>`, which ends the element and
 * hands the rest of the value to the HTML parser as markup:
 *
 *     </st</styleyle><img src=x onerror=...>   ->   </style><img src=x onerror=...>
 *
 * Rather than patch that regex, remove what the attack needs. A `<style>`
 * element's content is RAWTEXT, and the only thing that can terminate RAWTEXT
 * is the literal `</style`. No `<` means no tag, however the text is folded,
 * and CSS has no legitimate use for the character -- `>` is the child
 * combinator and stays.
 *
 * `url()` was not filtered at all, so the `@import` rule never achieved its
 * stated purpose: `background-image: url(https://…)` fetches from anywhere and
 * announces every visitor to whoever is on the other end. Relative URLs are
 * fine and useful, so only absolute and protocol-relative ones go.
 *
 * Both removals run to a fixed point, so nothing wins by nesting itself.
 */
export function safeCustomCss(raw: string | null | undefined): string {
  if (!raw) return "";

  let css = raw.slice(0, 20_000).replace(/</g, "");

  css = toFixedPoint(css, (s) => s.replace(/@import[^;}]*[;}]?/gi, ""));
  css = toFixedPoint(css, (s) =>
    s.replace(/url\(\s*['"]?\s*(?:[a-z][a-z0-9+.-]*:|\/\/)[^)]*\)/gi, "none"),
  );

  return css;
}

/** Apply `step` until it stops changing anything. */
function toFixedPoint(value: string, step: (s: string) => string): string {
  let current = value;
  // Each pass strictly shortens the string, so this terminates; the bound is
  // belt and braces against a future `step` that doesn't.
  for (let i = 0; i < 20; i++) {
    const next = step(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}
