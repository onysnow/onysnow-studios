import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { FooterPhotoStrip } from "./FooterPhotoStrip";
import { resolveSocialLinks } from "./SocialRail";
import { SubscribeForm } from "./SubscribeForm";
import { categoriesQuery, settingsQuery } from "@/lib/content";

const SITE_LINKS = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/services", label: "Services & pricing" },
  { to: "/journal", label: "Journal" },
  { to: "/about", label: "About" },
  { to: "/book", label: "Book a session" },
  { to: "/contact", label: "Contact" },
] as const;

const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy policy" },
  { to: "/terms", label: "Terms & conditions" },
] as const;

/** A link with the small marker the info columns use. */
function InfoLink({
  to,
  label,
  search,
}: {
  to: string;
  label: string;
  search?: { category: string };
}) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-primary" />
      <Link
        // The route table is typed; these are all known literals.
        to={to as "/portfolio"}
        {...(search ? { search } : {})}
        className="text-sm leading-6 text-foreground/75 transition-colors hover:text-foreground"
      >
        {label}
      </Link>
    </li>
  );
}

function ColumnHeading({ children }: { children: string }) {
  return <h2 className="font-display text-xl tracking-wide">{children}</h2>;
}

/**
 * The footer.
 *
 * Three groups rather than four thin columns: subscribe, connect, and everything
 * you can navigate to. The photo strip above it does the work the old identity
 * column was doing badly — showing what the studio makes — and the copyright
 * moves into its own band so the last thing on the page is a clean line rather
 * than a row of small print floating under the links.
 */
export function SiteFooter() {
  const { data: settings } = useQuery(settingsQuery);
  const { data: categories } = useQuery(categoriesQuery);

  const name = settings?.["studio_name"] || "OnySnow Studios";
  const email = settings?.["contact_email"]?.trim();
  const phone = settings?.["phone"]?.trim();
  const area = settings?.["service_area"]?.trim();
  const cats = categories ?? [];
  // Email is listed in full under the tiles, so it doesn't also need an icon.
  const socials = resolveSocialLinks(settings).filter((s) => !s.mailto);

  return (
    <footer>
      <FooterPhotoStrip />

      <div className="bg-card px-5 pb-14 pt-14 sm:px-8 lg:px-12 lg:pt-20">
        <div className="mx-auto grid max-w-screen-xl gap-12 lg:grid-cols-[1.1fr_0.7fr_1.2fr] lg:gap-16">
          {/* ---------------- Newsletter ---------------- */}
          <div>
            <ColumnHeading>Newsletter</ColumnHeading>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              New work, the occasional note on how a frame came together, and first word when dates
              open up. No more than once a month.
            </p>
            <div className="mt-6 max-w-sm">
              <SubscribeForm source="footer" variant="bare" />
            </div>
          </div>

          {/* ---------------- Connect ---------------- */}
          <div>
            <ColumnHeading>Let’s connect</ColumnHeading>
            {socials.length > 0 ? (
              <ul className="mt-5 grid max-w-[13rem] grid-cols-3 gap-2.5">
                {socials.map(({ key, label, Icon, href, mailto }) => (
                  <li key={key}>
                    <a
                      href={href}
                      {...(mailto ? {} : { target: "_blank", rel: "me noopener noreferrer" })}
                      aria-label={label}
                      className="grid aspect-square place-items-center rounded-md border border-white/10 bg-background/40 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-background/70 hover:text-primary"
                    >
                      <Icon className="size-[1.15rem]" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Contact details sit under the icons — the things a client needs
                when they've decided to get in touch rather than to follow. */}
            <ul className="mt-7 space-y-2.5 text-sm">
              {email ? (
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 text-foreground/75 transition-colors hover:text-foreground"
                  >
                    <Mail className="size-4 shrink-0 text-primary" /> {email}
                  </a>
                </li>
              ) : null}
              {phone ? (
                <li>
                  <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-2 text-foreground/75 transition-colors hover:text-foreground"
                  >
                    <Phone className="size-4 shrink-0 text-primary" /> {phone}
                  </a>
                </li>
              ) : null}
              {area ? (
                <li className="inline-flex items-center gap-2 text-foreground/75">
                  <MapPin className="size-4 shrink-0 text-primary" /> {area}
                </li>
              ) : null}
            </ul>
          </div>

          {/* ---------------- Info ---------------- */}
          <div>
            <ColumnHeading>Info</ColumnHeading>
            <div className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <nav aria-label="Footer navigation">
                <ul className="space-y-2">
                  {SITE_LINKS.map((l) => (
                    <InfoLink key={l.to} to={l.to} label={l.label} />
                  ))}
                  {LEGAL_LINKS.map((l) => (
                    <InfoLink key={l.to} to={l.to} label={l.label} />
                  ))}
                </ul>
              </nav>
              <nav aria-label="Portfolio collections">
                <ul className="space-y-2">
                  {cats.map((cat) => (
                    <InfoLink
                      key={cat.id}
                      to="/portfolio"
                      search={{ category: cat.slug }}
                      label={cat.name}
                    />
                  ))}
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* A band of its own, so the page ends on a deliberate line. */}
      <div className="bg-primary px-5 py-4 text-center">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-primary-foreground">
          © {new Date().getFullYear()} {name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
