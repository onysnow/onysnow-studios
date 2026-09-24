import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { adminPageContentQuery, updateRow } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import { safeHtml } from "@/lib/safe-html";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/pages")({ component: PagesPage });

const LABELS: Record<string, string> = {
  home: "Home",
  about: "About",
  portfolio: "Portfolio",
  services: "Services",
  journal: "Journal",
  duo: "Father & daughter",
  book: "Book",
  contact: "Contact",
  privacy: "Privacy",
  terms: "Terms",
};

function PagesPage() {
  const content = useQuery(adminPageContentQuery);
  const refresh = useContentRefresh();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  /*
   * Depends on the ROWS, not on the query object.
   *
   * The lint rule asked for `content` in the dependency array, and following
   * it literally would have been worse than the warning: useQuery returns a
   * fresh object every render, so depending on it re-runs the grouping on
   * every render and the memo stops being a memo. Pulling the rows out makes
   * the real dependency a plain value, which satisfies the rule honestly
   * rather than silencing it.
   */
  const rows = content.data;
  const grouped = useMemo(() => {
    const map: Record<string, typeof rows> = {};
    for (const row of rows ?? []) {
      map[row.page_slug] = [...(map[row.page_slug] ?? []), row];
    }
    return map;
  }, [rows]);

  const slugs = Object.keys(grouped);

  async function save(id: string) {
    const draft = drafts[id];
    if (draft === undefined) return;
    setSaving(id);
    try {
      // Only the `html` rows are markup; the rest are plain copy and are left
      // exactly as typed. Cleaned on save -- see lib/safe-html.ts for why not
      // on render.
      const row = (content.data ?? []).find((r) => r.id === id);
      const value = row?.format === "html" ? safeHtml(draft) : draft;
      await updateRow("page_content", id, { value });
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      refresh();
      toast.success("Saved");
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
    setSaving(null);
  }

  if (content.isLoading) {
    return (
      <>
        <AdminHeading title="Page copy" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeading
        title="Page copy"
        description="Every piece of writing on the website. Longer sections use the formatted editor."
      />
      <Tabs defaultValue={slugs[0] ?? "home"}>
        <TabsList className="flex-wrap">
          {slugs.map((slug) => (
            <TabsTrigger key={slug} value={slug}>
              {LABELS[slug] ?? slug}
            </TabsTrigger>
          ))}
        </TabsList>
        {slugs.map((slug) => (
          <TabsContent key={slug} value={slug} className="mt-6 space-y-8">
            {(grouped[slug] ?? []).map((row) => {
              const dirty = drafts[row.id] !== undefined;
              const value = drafts[row.id] ?? row.value;
              return (
                <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    {/*
                      A heading for the row, not a label for a control. It was
                      a <Label> with no htmlFor, which is the worst of both:
                      it announces itself as labelling something and labels
                      nothing. The editor below is a whole region rather than
                      one field, so it takes the name instead, via
                      aria-labelledby.
                    */}
                    <span
                      id={`section-${row.id}`}
                      className="text-xs uppercase tracking-widest text-muted-foreground"
                    >
                      {row.section_key.replace(/_/g, " ")}
                    </span>
                    <Button
                      size="sm"
                      variant={dirty ? "cinematic" : "ghost"}
                      disabled={!dirty || saving === row.id}
                      onClick={() => save(row.id)}
                    >
                      <Save /> {dirty ? "Save" : "Saved"}
                    </Button>
                  </div>
                  <div role="group" aria-labelledby={`section-${row.id}`}>
                    {row.format === "html" ? (
                      <RichTextEditor
                        value={value}
                        onChange={(html) => setDrafts((d) => ({ ...d, [row.id]: html }))}
                      />
                    ) : /*
                     * Branched on the SAVED value, not the draft.
                     *
                     * This read `value`, which is what is being typed — so
                     * crossing 90 characters changed the rendered component from
                     * an <input> to a <textarea>, React unmounted one and mounted
                     * the other, and the caret vanished mid-word.
                     */
                    row.value.length > 90 ? (
                      <Textarea
                        rows={3}
                        value={value}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        value={value}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
