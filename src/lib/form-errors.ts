import { toast } from "sonner";

/** Raised by the database rate-limit trigger; PostgREST passes it through as-is. */
const THROTTLED = "P0001";

/**
 * Shows a write failure to a visitor.
 *
 * A rate-limit rejection already carries copy written for the person reading it,
 * so it becomes the whole message. Anything else is a fault on our side, which
 * gets our own wording with the raw detail underneath.
 */
export function reportWriteError(error: { code?: string; message: string }, fallbackTitle: string) {
  if (error.code === THROTTLED) {
    toast.error(error.message);
    return;
  }
  toast.error(fallbackTitle, { description: error.message });
}
