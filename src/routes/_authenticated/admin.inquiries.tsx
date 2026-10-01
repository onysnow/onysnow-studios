import { createFileRoute } from "@tanstack/react-router";
import { InquiriesPage } from "@/components/admin/screens/InquiriesPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/inquiries")({
  component: InquiriesPage,
});
