import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Img } from "./Img";
import { coverPhotosQuery, settingsQuery } from "@/lib/content";

/**
 * The film-reel strip that sits directly above the footer.
 *
 * Edge to edge with no gutters, so the squares butt against each other and read
 * as one continuous run of frames rather than a row of cards. It sits above the
 * footer on its own layer and casts a shadow down onto it, which is what gives
 * the page a physical seam at the bottom instead of two flat bands meeting.
 *
 * Each frame is a way out to the feed; with no Instagram URL configured they
 * fall back to the portfolio so the strip is never a row of dead squares.
 */
export function FooterPhotoStrip() {
  const { data: settings } = useQuery(settingsQuery);
  const { data: photos } = useQuery(coverPhotosQuery);

  const url = settings?.["instagram_url"]?.trim();

  /*
   * Prefer an explicit handle, otherwise read it off the profile URL.
   *
   * Taking the last path segment isn't enough: a bare "https://instagram.com"
   * has no segment after the host, and naively popping gave "@instagram.com".
   * Only a real path segment counts as a handle.
   */
  const handleFromUrl = (() => {
    if (!url) return "";
    const path = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    // segments[0] is the host; a handle is whatever follows it.
    return segments.length > 1 ? (segments[segments.length - 1] ?? "") : "";
  })();
  const handle = settings?.["instagram_handle"]?.trim().replace(/^@/, "") || handleFromUrl;

  /*
   * Deduplicated by file, not by row.
   *
   * The same photograph can be attached to more than one collection, which gave
   * the strip the same frame twice with different ids — the keys were unique so
   * nothing complained, it just looked like a mistake.
   */
  const seen = new Set<string>();
  const tiles = (photos ?? [])
    .filter((photo) => {
      if (seen.has(photo.storage_path)) return false;
      seen.add(photo.storage_path);
      return true;
    })
    // Eight across on a wide screen; the column count steps down with the
    // breakpoints so the last row is never left half-empty.
    .slice(0, 8);

  if (tiles.length === 0) return null;

  const frame = "group relative block aspect-square overflow-hidden";
  const image = "transition-transform duration-[900ms] ease-out group-hover:scale-[1.08]";

  return (
    <section
      aria-labelledby="social-strip"
      // z-10 + shadow: the strip has to sit above the footer for its shadow to
      // land on it rather than behind it.
      className="relative z-10 shadow-[0_22px_45px_-12px_oklch(0_0_0/0.85)]"
    >
      <h2
        id="social-strip"
        className="bg-background pb-6 pt-12 text-center font-display text-lg tracking-[0.12em] text-primary"
      >
        {handle ? `@${handle}` : "From the studio"}
      </h2>

      {/*
        Flex rather than a fixed grid: the number of photographs is data, and a
        `grid-cols-8` left a gap on the right whenever fewer than eight came
        back. `flex-1` divides the width by whatever is actually there, so the
        run always reaches both edges. Below lg it scrolls instead of shrinking
        the frames to nothing — which is how a reel should behave anyway.
      */}
      <ul className="flex snap-x snap-mandatory overflow-x-auto lg:overflow-visible">
        {tiles.map((photo) => (
          <li
            key={photo.id}
            className="min-w-[33%] shrink-0 snap-start sm:min-w-[20%] lg:min-w-0 lg:flex-1 lg:shrink"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={frame}
                aria-label={photo.alt || photo.title || "View on Instagram"}
              >
                <Img
                  image={photo}
                  className="aspect-square"
                  sizes="(min-width: 1024px) 12.5vw, (min-width: 640px) 16.6vw, 25vw"
                  imgClassName={image}
                />
                {/* Lifts on hover so the frame under the cursor reads as the live one. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-background/15 transition-opacity duration-500 group-hover:opacity-0"
                />
              </a>
            ) : (
              <Link to="/portfolio" className={frame}>
                <Img
                  image={photo}
                  className="aspect-square"
                  sizes="(min-width: 1024px) 12.5vw, (min-width: 640px) 16.6vw, 25vw"
                  imgClassName={image}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-background/15 transition-opacity duration-500 group-hover:opacity-0"
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
