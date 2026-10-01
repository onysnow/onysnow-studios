import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/admin/screens/SettingsPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });
