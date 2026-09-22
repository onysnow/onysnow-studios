import { useEffect, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { settingsQuery } from "@/lib/content";

/**
 * Cal.com handles availability, timezones, buffers, reschedule and cancel links,
 * calendar sync, and — through its own Stripe app — taking a deposit or full
 * payment. That keeps every payment concern out of this codebase: no card data,
 * no webhooks, no PCI surface here.
 *
 * The link is stored in site_settings (`cal_link`, e.g. "onysnow/session"), so
 * Ony can change or add event types without a deploy.
 */
export function BookingEmbed() {
  const { data: settings, isPending } = useQuery(settingsQuery);
  const [ready, setReady] = useState(false);
  const calLink = settings?.["cal_link"]?.trim();

  useEffect(() => {
    if (!calLink) return;
    let cancelled = false;
    (async () => {
      try {
        const cal = await getCalApi({ namespace: "session" });
        // Match the embed to the site rather than letting it look bolted on.
        cal("ui", {
          theme: "dark",
          hideEventTypeDetails: false,
          cssVarsPerTheme: {
            dark: {
              "cal-brand": "#e0a44f",
              "cal-bg": "#1a1714",
              "cal-bg-emphasis": "#232019",
              "cal-border": "#3a342c",
            },
            light: { "cal-brand": "#e0a44f" },
          },
          layout: "month_view",
        });
        if (!cancelled) setReady(true);
      } catch {
        // Leave the skeleton in place; the fallback below still gives a way through.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calLink]);

  if (isPending) return <Skeleton className="h-[42rem] w-full" />;

  if (!calLink) {
    return (
      <div className="grid min-h-72 place-items-center border border-dashed border-border bg-card/40 px-6 text-center">
        <div>
          <p className="font-display text-xl text-foreground">Calendar not connected yet</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Add your Cal.com link under Settings → Cal.com link in the studio portal, and the live
            calendar appears here. Connect Stripe inside Cal.com to take deposits at the same time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[42rem]">
      {/* Reserve the height so the page doesn't jump when the embed mounts. */}
      {ready ? null : <Skeleton className="h-[42rem] w-full" />}
      <div className={ready ? "block" : "hidden"}>
        <Cal
          namespace="session"
          calLink={calLink}
          style={{ width: "100%", height: "100%", overflow: "scroll" }}
          config={{ layout: "month_view", theme: "dark" }}
        />
      </div>
    </div>
  );
}
