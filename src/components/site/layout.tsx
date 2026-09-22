import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives.
 *
 * Page geometry lives here and nowhere else. Before these existed, every section
 * hand-wrote `px-5 sm:px-8 lg:px-12` and `mx-auto max-w-screen-2xl` (20 and 13
 * times respectively) and picked its own vertical padding from 20 different
 * values — so sections drifted a few pixels apart and the page read as subtly
 * broken. Nothing enforced agreement because there was nothing to agree with.
 *
 * Rule: page files compose these; they do not write spacing or width classes.
 */

const SECTION_RHYTHM = {
  sm: "py-7 lg:py-10",
  base: "py-10 lg:py-16",
  lg: "py-14 lg:py-22",
  none: "",
} as const;

const GUTTER = "px-5 sm:px-8 lg:px-12";

const WIDTH = {
  prose: "max-w-[42rem]",
  content: "max-w-[64rem]",
  wide: "max-w-screen-2xl",
  full: "max-w-none",
} as const;

const TONE = {
  default: "",
  inverted: "bg-foreground text-background",
  bordered: "border-y border-border",
  muted: "bg-card",
} as const;

export type SectionProps = {
  children: ReactNode;
  size?: keyof typeof SECTION_RHYTHM;
  tone?: keyof typeof TONE;
  /** Skip the gutter so media can run edge to edge. */
  bleed?: boolean;
  className?: string;
  id?: string;
};

export function Section({ children, size = "base", tone = "default", bleed = false, className, id }: SectionProps) {
  return (
    <section id={id} className={cn(SECTION_RHYTHM[size], TONE[tone], !bleed && GUTTER, className)}>
      {children}
    </section>
  );
}

export type ContainerProps = {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
};

export function Container({ children, width = "wide", className }: ContainerProps) {
  return <div className={cn("mx-auto w-full", WIDTH[width], className)}>{children}</div>;
}

const COLS = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

const GAP = {
  /** Hairline dividers: children need their own background. */
  hairline: "gap-px bg-border",
  tight: "gap-2",
  base: "gap-5",
  loose: "gap-10 lg:gap-14",
} as const;

export type GridProps = {
  children: ReactNode;
  cols?: keyof typeof COLS;
  gap?: keyof typeof GAP;
  /** Equal-height children. On by default — this is what keeps rows aligned. */
  stretch?: boolean;
  className?: string;
};

export function Grid({ children, cols = 3, gap = "base", stretch = true, className }: GridProps) {
  return (
    <div className={cn("grid", COLS[cols], GAP[gap], stretch && "items-stretch", className)}>
      {children}
    </div>
  );
}

/**
 * A card that fills its grid cell and pins its footer to the bottom, so titles
 * line up with titles and buttons line up with buttons regardless of how much
 * body copy each one carries. Cards never set their own height.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cn("flex h-full flex-col bg-background", className)}>{children}</article>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-auto", className)}>{children}</div>;
}
