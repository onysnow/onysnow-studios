import { createFileRoute } from "@tanstack/react-router";
import { PostsPage } from "@/components/admin/screens/PostsPage";

/* The screen itself lives in components/admin/screens, so the effect lab's side menu can show it too. */
export const Route = createFileRoute("/_authenticated/admin/posts")({ component: PostsPage });
