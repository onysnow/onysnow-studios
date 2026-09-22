import type { ReactNode } from "react";
import { Glass } from "./Glass";

/**
 * A frosted content band. Kept as a named wrapper because "section" is what
 * these are at the call sites; all behaviour lives in Glass.
 */
export function GlassSection({
  children,
  className,
  overlap = true,
}: {
  children: ReactNode;
  className?: string;
  overlap?: boolean;
}) {
  return (
    <Glass className={className ?? ""} overlap={overlap}>
      {children}
    </Glass>
  );
}
