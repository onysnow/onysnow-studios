import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A frosted-glass surface.
 *
 * Frosted glass only reads as glass when there is something behind it to blur,
 * and the page background is a flat charcoal. So this lays down a soft colour
 * wash first, then floats a translucent, blurred panel over it — same effect as
 * the header, which sits over photography.
 */
export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative isolate">
      {/* Colour behind the glass, so the blur has something to work with. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 55% at 18% 20%, var(--teal) 0%, transparent 62%), radial-gradient(55% 50% at 82% 78%, var(--amber) 0%, transparent 60%)",
        }}
      />
      <div
        className={cn(
          "rounded-xl border border-white/10 bg-background/40 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/25",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
