import { Reveal } from "./Reveal";
import { Skeleton } from "@/components/ui/skeleton";

export function PageIntro({ eyebrow, title, body, loading = false }: { eyebrow: string; title: string; body: string; loading?: boolean }) {
  return <section className="px-5 pb-18 pt-36 sm:px-8 lg:px-12 lg:pb-24 lg:pt-44"><Reveal className="mx-auto max-w-screen-2xl"><p className="eyebrow">{eyebrow}</p>{loading ? <div className="mt-5 max-w-5xl space-y-4"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-2/3"/></div> : <h1 className="mt-5 max-w-5xl font-display text-6xl leading-none sm:text-7xl lg:text-8xl">{title}</h1>}{loading ? <Skeleton className="mt-8 h-12 max-w-2xl"/> : <p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{body}</p>}</Reveal></section>;
}
