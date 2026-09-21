import type { ReactNode } from "react";

export function AdminHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl leading-none">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
