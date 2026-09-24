import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Save } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { CodeEditor } from "@/components/admin/CodeEditor";
import { diffLines } from "@/lib/diff-lines";
import {
  EDITABLE_TABLES,
  TABLE_PK,
  adminCategoriesQuery,
  adminPageContentQuery,
  adminPhotosQuery,
  adminPostsQuery,
  adminServicesQuery,
  adminSettingsQuery,
  adminTestimonialsQuery,
  updateRow,
  type EditableTable,
} from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/advanced")({ component: AdvancedPage });

function AdvancedPage() {
  return (
    <>
      <AdminHeading
        title="Advanced"
        description="Direct editing for precise or bulk changes, plus your own styling rules. Nothing saves until it passes a check."
      />
      <Tabs defaultValue="json">
        <TabsList>
          <TabsTrigger value="json">Record editor</TabsTrigger>
          <TabsTrigger value="css">Custom styling</TabsTrigger>
        </TabsList>
        <TabsContent value="json" className="mt-6">
          <JsonEditor />
        </TabsContent>
        <TabsContent value="css" className="mt-6">
          <CssEditor />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------ record editor ------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function JsonEditor() {
  const refresh = useContentRefresh();
  const [table, setTable] = useState<EditableTable>("categories");
  const [rowId, setRowId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const queries = {
    categories: useQuery(adminCategoriesQuery),
    photos: useQuery(adminPhotosQuery),
    services: useQuery(adminServicesQuery),
    testimonials: useQuery(adminTestimonialsQuery),
    page_content: useQuery(adminPageContentQuery),
    site_settings: useQuery(adminSettingsQuery),
    posts: useQuery(adminPostsQuery),
  };
  const rows = (queries[table].data ?? []) as Row[];
  const pk = TABLE_PK[table];
  const current = rows.find((r) => String(r[pk]) === rowId);
  const saved = useMemo(() => (current ? JSON.stringify(current, null, 2) : ""), [current]);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);
  useEffect(() => {
    setRowId("");
  }, [table]);

  const parsed = useMemo(() => {
    if (!draft.trim()) return { ok: false as const, error: "Nothing to save yet." };
    try {
      const value = JSON.parse(draft) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false as const, error: "The record must be a single JSON object." };
      }
      const obj = value as Row;
      if (current && String(obj[pk]) !== String(current[pk])) {
        return {
          ok: false as const,
          error: `“${pk}” cannot be changed here — it identifies the record.`,
        };
      }
      const unknownKeys = current ? Object.keys(obj).filter((k) => !(k in current)) : [];
      if (unknownKeys.length) {
        return {
          ok: false as const,
          error: `Unexpected field${unknownKeys.length === 1 ? "" : "s"}: ${unknownKeys.join(", ")}`,
        };
      }
      const missing = current ? Object.keys(current).filter((k) => !(k in obj)) : [];
      if (missing.length) {
        return {
          ok: false as const,
          error: `Missing field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
        };
      }
      return { ok: true as const, value: obj };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "That is not valid JSON.",
      };
    }
  }, [draft, current, pk]);

  const changed = Boolean(current) && draft !== saved;
  const diff = useMemo(() => diffLines(saved, draft), [saved, draft]);

  async function commit() {
    if (!current || !parsed.ok) return;
    const patch = { ...parsed.value };
    delete patch[pk];
    delete patch["created_at"];
    delete patch["updated_at"];
    try {
      await updateRow(table, String(current[pk]), patch);
      setConfirmOpen(false);
      refresh();
      toast.success("Record saved");
    } catch (error) {
      toast.error("The database refused that change", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  function labelFor(row: Row) {
    return String(
      row["name"] ?? row["title"] ?? row["key"] ?? row["section_key"] ?? row["author"] ?? row[pk],
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Table">
          {(id) => (
            <Select value={table} onValueChange={(v) => setTable(v as EditableTable)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDITABLE_TABLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Record">
          {(id) => (
            <Select value={rowId} onValueChange={setRowId}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Choose a record" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((r) => (
                  <SelectItem key={String(r[pk])} value={String(r[pk])}>
                    {labelFor(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {current ? (
        <>
          <CodeEditor value={draft} onChange={setDraft} language="json" />
          {parsed.ok ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 text-primary" /> Valid JSON, all fields accounted for.
            </p>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Not saveable yet</AlertTitle>
              <AlertDescription>{parsed.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3">
            <Button
              variant="cinematic"
              disabled={!parsed.ok || !changed}
              onClick={() => setConfirmOpen(true)}
            >
              <Save /> Review and save
            </Button>
            <Button variant="ghost" disabled={!changed} onClick={() => setDraft(saved)}>
              Discard changes
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a record to edit its raw data.</p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Confirm these changes</DialogTitle>
            <DialogDescription>
              Red lines are replaced, green lines are what will be saved.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs">
            {diff.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap",
                  line.type === "added" && "bg-primary/10 text-primary",
                  line.type === "removed" && "bg-destructive/10 text-destructive line-through",
                  line.type === "same" && "text-muted-foreground",
                )}
              >
                {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="cinematic" onClick={commit}>
              Save record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ custom styling ----------------------------- */

const CSS_KEY = "custom_css";

function CssEditor() {
  const settings = useQuery(adminSettingsQuery);
  const refresh = useContentRefresh();
  const savedRow = (settings.data ?? []).find((s) => s.key === CSS_KEY);
  const saved = savedRow?.value ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;

  const problem = useMemo(() => validateCss(value), [value]);

  async function save() {
    if (problem) return;
    try {
      await updateRow("site_settings", CSS_KEY, { value });
      setDraft(null);
      refresh();
      toast.success("Styling applied to the site");
    } catch (error) {
      toast.error("Could not save the styling", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-sm text-muted-foreground">
        These rules are added to every page of the website. They load last, so they win over the
        built-in styling. Leave it empty to go back to the original look.
      </p>
      <CodeEditor value={value} onChange={setDraft} language="css" />
      {problem ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Not saveable yet</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" /> Brackets balanced — safe to apply.
        </p>
      )}
      <div className="flex gap-3">
        <Button
          variant="cinematic"
          disabled={Boolean(problem) || draft === null || value === saved}
          onClick={save}
        >
          <Save /> Apply styling
        </Button>
        <Button variant="ghost" disabled={draft === null} onClick={() => setDraft(null)}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}

/** Light structural check: balanced braces and no script-ish content. */
function validateCss(source: string): string | null {
  if (!source.trim()) return null;
  if (/<\/?script/i.test(source) || /javascript:/i.test(source))
    return "Scripts are not allowed in styling.";
  let depth = 0;
  for (const char of source) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth < 0) return "There is a closing brace } without a matching opening brace.";
  }
  if (depth !== 0)
    return `${depth} rule${depth === 1 ? "" : "s"} left unclosed — check your braces.`;
  return null;
}
