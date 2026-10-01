import { createFileRoute } from "@tanstack/react-router";
import { PhotosPage } from "@/components/admin/screens/PhotosPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/photos")({ component: PhotosPage });
