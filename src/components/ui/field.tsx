import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A label and its control, wired together by an id neither of them can get
 * wrong.
 *
 * WHY A COMPONENT AND NOT JUST AN `htmlFor`
 *
 * Every one of these fields in the admin lives inside a `.map()` over rows, so
 * an id has to be unique per row as well as per field. Writing that by hand at
 * twenty call sites is how I produced `htmlFor` attributes pointing at ids
 * that did not exist -- which is WORSE than no association, because a label
 * that points nowhere reads as correct to a linter and does nothing for a
 * screen reader. I reverted that and left it undone for weeks.
 *
 * `useId` removes the problem rather than solving it carefully. Each Field is
 * its own component instance, so it gets its own id from React -- no row key
 * to thread through, no template string to typo, and nothing to keep in sync
 * when rows are added or reordered. It cannot dangle, because the same value
 * is handed to both halves.
 *
 * The control comes in as a render prop rather than as children, because the
 * id has to reach it. Anything that takes an `id` works: Input, Textarea, and
 * SelectTrigger, which is the one that needs the id on the TRIGGER rather than
 * on the Select.
 */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  /** Optional description, associated via aria-describedby. */
  hint?: ReactNode;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
