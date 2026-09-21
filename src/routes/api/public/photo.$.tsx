import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves a photograph out of the private "photos" storage bucket.
 * The bucket is private, so this route mints a long-lived signed URL with the
 * publishable key (anon may SELECT the bucket) and redirects to it. That keeps
 * <img src> plain and cacheable without exposing any secret.
 */
export const Route = createFileRoute("/api/public/photo/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>)["_splat"] ?? "";
        const path = decodeURIComponent(raw).replace(/^\/+/, "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!url || !key) return new Response("Storage not configured", { status: 500 });

        const res = await fetch(`${url}/storage/v1/object/sign/photos/${path}`, {
          method: "POST",
          headers: { apikey: key, "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 365 }),
        });
        if (!res.ok) return new Response("Photo not found", { status: 404 });
        const body = (await res.json()) as { signedURL?: string };
        if (!body.signedURL) return new Response("Photo not found", { status: 404 });

        return new Response(null, {
          status: 302,
          headers: {
            location: `${url}/storage/v1${body.signedURL}`,
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
