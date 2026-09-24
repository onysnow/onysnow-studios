import { Link } from "@tanstack/react-router";
import { Glass } from "./Glass";
import { Menu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { settingsQuery } from "@/lib/content";
import { GlassToggle } from "./GlassToggle";
import { DevNav } from "./DevNav";

const links = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/journal", label: "Journal" },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const { data } = useQuery(settingsQuery);
  const name = data?.["studio_name"] || "OnySnow Studios";
  const words = name.split(" ");
  const lead = words.slice(0, -1).join(" ") || name;
  const tail = words.length > 1 ? words[words.length - 1] : "";
  return (
    <Glass as="header" variant="bar" className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto grid h-16 max-w-screen-2xl grid-cols-[minmax(0,1fr)_auto] items-center px-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          className="min-w-0 font-display text-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          OnySnow <span className="text-primary">Studios</span>
        </Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {link.label}
            </Link>
          ))}
          <Button asChild variant="cinematic" size="lg">
            <Link to="/book">Book a session</Link>
          </Button>
          {/* The routes that exist but are not part of the site's story. */}
          <DevNav />
          {/* A disc of the material, which switches which material it is. */}
          <GlassToggle />
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex w-full max-w-none flex-col border-l-0 bg-background p-8 sm:max-w-none"
          >
            <SheetTitle className="font-display text-xl">OnySnow Studios</SheetTitle>
            <nav className="mt-16 flex flex-col items-start gap-7" aria-label="Mobile navigation">
              {links.map((link) => (
                <SheetClose asChild key={link.to}>
                  <Link to={link.to} className="font-display text-3xl text-foreground">
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
              <SheetClose asChild>
                <Button asChild variant="cinematic" size="lg" className="mt-4">
                  <Link to="/book">Book a session</Link>
                </Button>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </Glass>
  );
}
