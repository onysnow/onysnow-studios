import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/content";

export function SiteFooter() {
  const { data } = useQuery(settingsQuery);
  const name = data?.["studio_name"] || "OnySnow Studios";
  const tagline = data?.["tagline"] || "Professional candid photography, made with feeling.";
  const instagram = data?.["instagram_url"];
  return (
    <footer className="border-t border-border bg-card px-5 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-screen-2xl gap-10 md:grid-cols-[1fr_auto] md:items-end">
        <div><p className="font-display text-4xl">{name}</p><p className="mt-2 text-sm text-muted-foreground">{tagline}</p></div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs uppercase tracking-widest text-muted-foreground">
          <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
          {instagram ? <a href={instagram} aria-label="Instagram"><Instagram className="size-4" /></a> : null}
        </div>
      </div>
    </footer>
  );
}
