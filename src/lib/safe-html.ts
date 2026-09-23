import sanitize from "sanitize-html";

/**
 * Sanitising the HTML the studio authors, and the links it configures.
 *
 * Only an admin can write any of this, so it is trusted-author content by
 * design. That is a reason to bound it, not to skip bounding it: without a
 * sanitizer, one compromised admin credential -- or one paste from a page
 * someone found online -- becomes a script tag on the home page, the about
 * page, the legal pages and every journal post, served to every visitor. The
 * blast radius of an authoring mistake should be a broken layout, not that.
 *
 * Applied when the studio SAVES, not when a visitor reads. `sanitize-html`
 * costs about 48 kB gzipped, and the admin portal is already code-split away
 * from the public bundle, so paying it there costs visitors nothing. What that
 * buys and what it does not is written out at `safeHtml` below.
 *
 * The allowlist is the set of tags TipTap's StarterKit can actually produce
 * (see components/admin/RichTextEditor.tsx), plus the handful of inline tags a
 * studio reasonably pastes in. Anything else is dropped rather than escaped,
 * because the studio wants their formatting to work, not to see their markup
 * printed back at them.
 *
 * `sanitize-html` is used rather than DOMPurify because the server renders on
 * Cloudflare Workers, where there is no DOM to give DOMPurify -- its whole
 * dependency chain is pure JavaScript and runs in both places, so the same
 * output is produced during SSR and after hydration.
 */
const ALLOWED: sanitize.IOptions = {
  allowedTags: [
    // StarterKit's block nodes.
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "hr",
    "br",
    // StarterKit's marks, plus the inline tags paste tends to bring.
    "strong",
    "b",
    "em",
    "i",
    "s",
    "strike",
    "u",
    "sub",
    "sup",
    "span",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    // No `style` anywhere: it is the one attribute that can still reach out to
    // the network (`background: url(...)`) and move things over the page.
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // A protocol-relative or scheme-less href resolves against the current page,
  // which is fine; anything with a scheme must be one of the above.
  allowProtocolRelative: false,
  // Any link that survives opens safely, whether or not the author said so.
  transformTags: {
    a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
  disallowedTagsMode: "discard",
};

/**
 * Clean a block of studio-authored rich text on its way to the database.
 *
 * What this covers: anything the studio pastes in from somewhere else, which is
 * the realistic way hostile markup gets into a one-operator site.
 *
 * What it does not: rows written before this existed, and a write made directly
 * to PostgREST with stolen admin credentials, since that skips the editor
 * entirely. Closing those means sanitising on render instead, which puts the
 * parser on every public page -- a trade worth making if this ever becomes a
 * site with several authors, and not before.
 */
export function safeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitize(html, ALLOWED);
}
