import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SocialRail } from "./SocialRail";
import { SubscribeForm } from "./SubscribeForm";
import { Container } from "./layout";
import { categoriesQuery, settingsQuery } from "@/lib/content";

const SITE_LINKS = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/services", label: "Services & pricing" },
  { to: "/journal", label: "Journal" },
  { to: "/about", label: "About" },
  { to: "/book", label: "Book a session" },
  { to: "/contact", label: "Contact" },
] as const;

/**
 * A working footer: every page reachable, every collection reachable, the
 * contact details a client actually needs, and one more chance to subscribe.
 */
export function SiteFooter() {
  const { data: settings } = useQuery(settingsQuery);
  const { data: categories } = useQuery(categoriesQuery);

  const name = settings?.["studio_name"] || "OnySnow Studios";
  const tagline = settings?.["tagline"] || "Professional candid photography, made with feeling.";
  const email = settings?.["contact_email"]?.trim();
  const phone = settings?.["phone"]?.trim();
  const area = settings?.["service_area"]?.trim();
  const cats = categories ?? [];

  const heading = "text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground";
  const item = "text-sm text-foreground/80 transition-colors hover:text-foreground";

  return (
    <footer className="border-t border-border bg-card px-5 pb-8 pt-12 sm:px-8 lg:px-12 lg:pt-16">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr_1.4fr]">
          {/* Identity */}
          <div>
            <p className="font-display text-xl">{name}</p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{tagline}</p>
            <SocialRail settings={settings} className="mt-6" showLabels={false} />
          </div>

          {/* Site navigation */}
          <nav aria-label="Footer navigation">
            <p className={heading}>Explore</p>
            <ul className="mt-4 space-y-2.5">
              {SITE_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={item}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Collections */}
          <nav aria-label="Portfolio collections">
            <p className={heading}>Collections</p>
            <ul className="mt-4 space-y-2.5">
              {cats.map((cat) => (
                <li key={cat.id}>
                  <Link to="/portfolio" search={{ category: cat.slug }} className={item}>
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact + subscribe */}
          <div>
            <p className={heading}>Get in touch</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {email ? (
                <li>
                  <a href={`mailto:${email}`} className={`${item} inline-flex items-center gap-2`}>
                    <Mail className="size-4 text-primary" /> {email}
                  </a>
                </li>
              ) : null}
              {phone ? (
                <li>
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`${item} inline-flex items-center gap-2`}>
                    <Phone className="size-4 text-primary" /> {phone}
                  </a>
                </li>
              ) : null}
              {area ? (
                <li className="inline-flex items-center gap-2 text-foreground/80">
                  <MapPin className="size-4 text-primary" /> {area}
                </li>
              ) : null}
            </ul>
            <div className="mt-7">
              <SubscribeForm source="footer" />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {name}. All photographs are the studio’s own.
          </p>
          <div className="flex gap-6 text-xs uppercase tracking-widest text-muted-foreground">
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
