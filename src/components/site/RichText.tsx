import { cn } from "@/lib/utils";

/**
 * Renders stored rich text from the admin portal.
 *
 * The HTML is sanitised where it is SAVED (lib/safe-html.ts, called from the
 * admin editors) rather than here. Doing it here would put a full HTML parser
 * on every public page -- measured at +48 kB gzipped on the entry chunk -- to
 * defend against a write that already requires admin credentials.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  return <div className={cn("rich-text", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
