import { cn } from "@/lib/utils";

/** Renders stored rich text from the admin portal. */
export function RichText({ html, className }: { html: string; className?: string }) {
  return <div className={cn("rich-text", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
