import { cn } from "@/lib/utils";
import { resolveSocialLinks, type SocialLink } from "@/lib/social-links";

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
