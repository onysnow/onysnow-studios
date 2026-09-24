import { Facebook, Instagram, Mail, Music2, Twitter, Youtube, Palette } from "lucide-react";
import type { ComponentType } from "react";

import { safeHref } from "@/lib/safe-content";

/**
 * The social platforms and how a settings row becomes a link.
 *
 * Split out of SocialRail.tsx because that file also exports a component, and
 * a file that exports both stops React Fast Refresh working on it -- it cannot
 * tell a component whose state to preserve from a helper to replace, so it
 * reloads the whole module. Both the rail and the footer's tile grid import
 * from here, which is also why this was shared in the first place.
 */

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
export const PLATFORMS: Platform[] = [
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
    // These come from the settings table and go straight into `href`, where a
    // `javascript:` URL is one click from running as the visitor. A link whose
    // scheme doesn't survive is dropped rather than rendered dead.
    const href = safeHref(p.mailto ? `mailto:${raw}` : raw);
    if (!href) return null;
    return { ...p, href };
  }).filter((p): p is SocialLink => p !== null);
}
