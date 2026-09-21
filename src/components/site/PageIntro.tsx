import { Reveal } from "./Reveal";

export function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <section className="px-5 pb-18 pt-36 sm:px-8 lg:px-12 lg:pb-24 lg:pt-44"><Reveal className="mx-auto max-w-screen-2xl"><p className="eyebrow">{eyebrow}</p><h1 className="mt-5 max-w-5xl font-display text-6xl leading-none sm:text-7xl lg:text-8xl">{title}</h1><p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{body}</p></Reveal></section>;
}
