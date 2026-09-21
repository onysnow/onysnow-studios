import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CONTENT_KEYS } from "@/lib/admin";

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
      if (!user) return { user: null, isAdmin: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("bootstrap_current_user");
      const isAdmin = Boolean(data?.is_admin);
      return { user, isAdmin, claimedFirstAdmin: Boolean(data?.claimed_first_admin) };
    },
  });
}

/** Refresh every admin table and the matching public-site query. */
export function useContentRefresh() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of CONTENT_KEYS) void qc.invalidateQueries({ queryKey: key });
  }, [qc]);
}
