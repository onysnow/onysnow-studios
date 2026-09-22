import { Facebook, Instagram, Mail, Music2, Twitter, Youtube, Palette } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type Platform = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  mailto?: boolean;
};

/**
 * Platforms are driven from site_settings, so adding one later is a portal edit
 * rather than a code change. Anything left blank simply doesn't render.
 */
const PLATFORMS: Platform[] = [
  { key: "instagram_url", label: "Instagram", Icon: Instagram },
  { key: "tiktok_url", label: "TikTok", Icon: Music2 },
  { key: "facebook_url", label: "Facebook", Icon: Facebook },
  { key: "youtube_url", label: "YouTube", Icon: Youtube },
  { key: "x_url", label: "X", Icon: Twitter },
  { key: "behance_url", label: "Behance", Icon: Palette },
  { key: "contact_email", label: "Email", Icon: Mail, mailto: true },
];

export type SocialLink = Platform & { href: string };

/**
 * Resolves the configured platforms once, so the rail and the footer's tile grid
 * render the same set from the same settings keys rather than each keeping their
 * own list that drifts.
 */
export function resolveSocialLinks(settings: Record<string, string> | undefined): SocialLink[] {
  return PLATFORMS.map((p) => {
    const raw = settings?.[p.key]?.trim();
    if (!raw) return null;
    return { ...p, href: p.mailto ? `mailto:${raw}` : raw };
  }).filter((p): p is SocialLink => p !== null);
}

export function SocialRail({
  settings,
  className,
  showLabels = true,
}: {
  settings: Record<string, string> | undefined;
  className?: string;
  showLabels?: boolean;
}) {
  const links = resolveSocialLinks(settings);

  if (links.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      {links.map(({ key, label, Icon, href, mailto }) => (
        <li key={key}>
          <a
            href={href}
            {...(mailto ? {} : { target: "_blank", rel: "me noopener noreferrer" })}
            className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon className="size-4" />
            <span
              className={cn(
                "text-xs uppercase tracking-widest",
                showLabels ? "hidden sm:inline" : "sr-only",
              )}
            >
              {label}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
