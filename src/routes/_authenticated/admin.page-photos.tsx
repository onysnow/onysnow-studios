import { createFileRoute } from "@tanstack/react-router";
import { PagePhotosPage } from "@/components/admin/screens/PagePhotosPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/page-photos")({
  component: PagePhotosPage,
});
