import { createFileRoute } from "@tanstack/react-router";
import { AdvancedPage } from "@/components/admin/screens/AdvancedPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/advanced")({ component: AdvancedPage });
