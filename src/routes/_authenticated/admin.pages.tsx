import { createFileRoute } from "@tanstack/react-router";
import { PagesPage } from "@/components/admin/screens/PagesPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/pages")({ component: PagesPage });
