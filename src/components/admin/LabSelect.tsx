import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type LabOption = { value: string; label: ReactNode };
export type LabOptionGroup = { label: string; options: readonly LabOption[] };

/**
 * The lab's drop-downs, in the site's own colours.
 *
 * They were native <select>s. Windows draws a native list white, and the
 * options took the page's light text onto it -- unreadable (Ony,
 * 2026-10-01: "all of the nav menu items are hard to read", "the pop up
 * window is not on theme with our site"). This is the site's themed list
 * (Radix Select via components/ui/select): dark, amber group headings,
 * and above everything else in the lab.
 */
export function LabSelect({
  id,
  value,
  onChange,
  options,
  groups,
  className,
  title,
  data,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly LabOption[];
  groups?: readonly LabOptionGroup[];
  className?: string;
  title?: string;
  /** data-* attributes for the trigger (tests and the lab's own lookups). */
  data?: Record<`data-${string}`, string | boolean>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} title={title} className={cn("h-8 text-sm", className)} {...data}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[10000] max-h-[70vh] border-border bg-popover text-popover-foreground">
        {options?.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {groups?.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel className="text-[11px] font-normal uppercase tracking-[0.16em] text-primary">
              {g.label}
            </SelectLabel>
            {g.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
