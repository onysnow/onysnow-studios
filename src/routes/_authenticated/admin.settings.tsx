import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { adminSettingsQuery, updateRow } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });

/**
 * The display faces, by the slug `CustomCss` and styles.css actually match on.
 *
 * These used to be human-readable names -- "Barlow Condensed" -- which no
 * consumer could match: `CustomCss` lowercases and tests against a hyphenated
 * set, so "barlow condensed" never hit, and styles.css only defines rules for
 * the hyphenated form. Choosing a font did nothing, forever, including the
 * value the database was seeded with.
 *
 * Anton and Oswald are gone. Neither is in the Google Fonts request in
 * __root.tsx, so offering them was the same lie in a different place.
 */
const DISPLAY_FONTS = [
  { value: "jost", label: "Jost — the studio default" },
  { value: "inter-tight", label: "Inter Tight — tighter, more neutral" },
  { value: "barlow-condensed", label: "Barlow Condensed — condensed film titling" },
];

function SettingsPage() {
  const settings = useQuery(adminSettingsQuery);
  const refresh = useContentRefresh();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function saveAll() {
    const entries = Object.entries(drafts);
    if (!entries.length) return;
    setSaving(true);
    try {
      /*
       * Together, not one round trip at a time.
       *
       * Saving fifteen settings was fifteen sequential requests, so the button
       * sat spinning for as long as the network took times fifteen. They are
       * independent rows; nothing needs the previous one to have landed.
       */
      await Promise.all(entries.map(([key, value]) => updateRow("site_settings", key, { value })));
      setDrafts({});
      refresh();
      toast.success("Settings saved");
    } catch (error) {
      toast.error("Could not save the settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
    setSaving(false);
  }

  if (settings.isLoading) {
    return (
      <>
        <AdminHeading title="Settings" />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </>
    );
  }

  // Custom CSS has its own editor under Advanced.
  const rows = (settings.data ?? []).filter((s) => s.kind !== "css");
  const dirty = Object.keys(drafts).length > 0;

  return (
    <>
      <AdminHeading
        title="Settings"
        description="Studio details, links, search-engine defaults, and how the headline type looks."
        action={
          <Button variant="cinematic" disabled={!dirty || saving} onClick={saveAll}>
            <Save /> {dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      <div className="grid max-w-3xl gap-6">
        {rows.map((row) => {
          const value = drafts[row.key] ?? row.value;
          const set = (v: string) => setDrafts((d) => ({ ...d, [row.key]: v }));
          return (
            <div key={row.key} className="space-y-2">
              <Label htmlFor={`setting-${row.key}`}>{row.label || row.key}</Label>
              {row.kind === "bool" ? (
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    id={`setting-${row.key}`}
                    checked={value.toLowerCase() === "true"}
                    onCheckedChange={(v) => set(v ? "true" : "false")}
                  />
                  {value.toLowerCase() === "true" ? "On" : "Off"}
                </label>
              ) : row.kind === "font" ? (
                <Select value={value} onValueChange={set}>
                  <SelectTrigger id={`setting-${row.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPLAY_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : row.kind === "scale" ? (
                <div className="flex items-center gap-4">
                  <Slider
                    id={`setting-${row.key}`}
                    min={0.8}
                    max={1.3}
                    step={0.01}
                    value={[Number(value) || 1]}
                    onValueChange={([v]) => set(String(v ?? 1))}
                    className="max-w-sm"
                  />
                  <span className="w-16 font-mono text-sm text-muted-foreground">
                    {Number(value || 1).toFixed(2)}×
                  </span>
                </div>
              ) : row.kind === "longtext" ? (
                <Textarea
                  id={`setting-${row.key}`}
                  rows={3}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              ) : (
                <Input
                  id={`setting-${row.key}`}
                  type={row.kind === "email" ? "email" : row.kind === "url" ? "url" : "text"}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
