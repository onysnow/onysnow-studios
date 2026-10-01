import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CONTENT_KEYS } from "@/lib/admin";
import { noteAdmin } from "@/lib/admin-gate";

/**
 * Ensures the signed-in person has a profile row, claims the very first admin
 * seat when nobody holds it yet, and reports whether they are an admin.
 */
export function useAdminStatus() {
  return useQuery({
    queryKey: ["admin-status"],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        noteAdmin(null, false);
        return { user: null, isAdmin: false };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("bootstrap_current_user");
      const isAdmin = Boolean(data?.is_admin);
      /*
       * `claimed_first_admin` is gone, and has been since migration
       * 20260921214942 redefined bootstrap_current_user to return only
       * `is_admin`. The original version reported whether admin_users was
       * empty, because back then signing in when it was empty GRANTED you
       * admin -- that automatic grant is exactly what was closed.
       *
       * So this read a field the function no longer returns, coerced the
       * undefined to false, and handed back a flag that was permanently
       * false. Nothing consumed it, which is the only reason it never
       * surfaced as a bug. Removed rather than re-plumbed: there is no
       * first-admin claim left to report.
       */
      // The browser's note that the admin is signed in here (lib/admin-gate).
      noteAdmin(user.id, isAdmin);
      return { user, isAdmin };
    },
  });
}

/** Fired when an edit has been saved (the lab reloads its preview). */
export const CONTENT_CHANGED = "onysnow:content-changed";

/** Refresh every admin table and the matching public-site query. */
export function useContentRefresh() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of CONTENT_KEYS) void qc.invalidateQueries({ queryKey: key });
    // The effect lab's preview shows the site live: tell it the content changed.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CONTENT_CHANGED));
  }, [qc]);
}
