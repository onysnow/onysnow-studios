import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Scripts whose letters carry roughly a Latin advance width, so a cycling glyph
 * fits the cell its English character reserves.
 *
 * Kana, jamo, Devanagari and Thai are deliberately excluded: they're full-width
 * or tall, so they either overlap their neighbours or force the settled headline
 * to sit unnaturally wide. Five writing systems still read unmistakably as
 * languages rather than as noise.
 */
/**
 * Substitutes, bucketed by advance width.
 *
 * Each cell reserves the width of its final English character, so a substitute
 * has to be about that wide or it overlaps its neighbours. Picking from a bucket
 * matched to the letter being replaced fixes that without ever reflowing the
 * line — an `i` only ever becomes a narrow glyph, a `w` only ever a wide one.
 *
 * Kana, jamo, Devanagari and Thai are excluded: full-width or tall, so they
 * can't sit in a Latin cell. Greek, Cyrillic, Armenian, Georgian and Hebrew
 * still read unmistakably as languages.
 */
const NARROW = [
  "ι", "ί", "ϊ", "і", "ї", "ј", "ן", "ו", "י", "ւ", "ի", "ჲ", "ı", "l",
];

const WIDE = [
  "Ж", "Ш", "Щ", "Ю", "Ф", "Ы", "ш", "щ", "ю", "ы", "ω", "ϖ", "Ω", "Φ", "Ψ", "მ", "ღ", "ա",
];

const MEDIUM = [
  // Greek
  "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ",
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "κ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ",
  // Cyrillic
  "Б", "Г", "Д", "З", "И", "Й", "Л", "П", "Ц", "Ч", "Э", "Я",
  "б", "в", "г", "д", "ж", "з", "и", "й", "к", "н", "п", "т", "ф", "ц", "ч", "э", "я",
  // Armenian
  "Թ", "Ի", "Ղ", "Շ", "Ճ", "Ձ", "Ծ", "բ", "գ", "դ", "ե", "զ", "ը", "լ",
  // Georgian
  "გ", "ზ", "ო", "შ", "წ", "ჭ", "ჰ", "ე", "ვ", "ლ", "ნ",
  // Hebrew
  "א", "ב", "ג", "ד", "ה", "ז", "ח", "ט", "כ", "ל", "מ", "נ", "ס", "ע", "צ", "ק", "ר", "ש", "ת",
];

type Width = "narrow" | "medium" | "wide";

function widthOf(ch: string): Width {
  if (/[iltfjrI1.,;:'’!|]/.test(ch)) return "narrow";
  if (/[mwMW@]/.test(ch)) return "wide";
  return "medium";
}

const POOLS: Record<Width, string[]> = { narrow: NARROW, medium: MEDIUM, wide: WIDE };

function pick(width: Width): string {
  const pool = POOLS[width];
  return pool[Math.floor(Math.random() * pool.length)] ?? "Δ";
}

type CharState = {
  /** The English character this cell resolves to. */
  final: string;
  /** Whether this cell animates at all (spaces and punctuation don't). */
  animates: boolean;
  /** ms before this cell starts cycling. */
  start: number;
  /** ms this cell keeps cycling before it settles. */
  duration: number;
  /** ms between glyph changes — each cell cycles at its own speed. */
  interval: number;
  /** Which substitute pool this cell draws from, matched to its own width. */
  width: Width;
};

/** Punctuation and whitespace stay put, so the sentence keeps its shape throughout. */
function animatable(ch: string) {
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * The whole sentence is present from the first frame; each letter cycles through
 * other writing systems on its own clock and lands in English at its own moment.
 *
 * `use-scramble` can't express this — it advances a single scramble head left to
 * right at one global speed. Per-character start, speed and settle time need
 * per-character state, so this is hand-rolled on one rAF loop.
 *
 * Layout never shifts and glyphs never collide: each cell reserves the width of
 * its final English glyph, and substitutes are drawn from a pool matched to that
 * width, so nothing overflows into its neighbour.
 */
export function ScrambleText({
  text,
  className,
  /** Roughly how long until the last letter settles, in ms. */
  totalMs = 2000,
}: {
  text: string;
  className?: string;
  totalMs?: number;
}) {
  const [frame, setFrame] = useState(0);
  const [animate, setAnimate] = useState(false);
  const glyphs = useRef<string[]>([]);
  const settled = useRef<boolean[]>([]);

  const chars = useMemo<CharState[]>(() => {
    const list = Array.from(text);
    return list.map((final) => {
      const animates = animatable(final);
      return {
        final,
        animates,
        width: widthOf(final),
        // Spread the starts across the first half so letters don't move in unison,
        // and the settles across the rest — hence "different times".
        start: animates ? Math.random() * totalMs * 0.35 : 0,
        duration: animates ? totalMs * (0.35 + Math.random() * 0.6) : 0,
        // 95–300ms per change: in a 2s window each letter still gets 7-20 changes,
        // enough to register as letters rather than a flicker.
        interval: 95 + Math.random() * 205,
      };
    });
  }, [text, totalMs]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);

    glyphs.current = chars.map((c) => (c.animates ? pick(c.width) : c.final));
    settled.current = chars.map((c) => !c.animates);

    let raf = 0;
    const t0 = performance.now();
    const nextAt = chars.map((c) => t0 + c.start);

    const tick = (now: number) => {
      let changed = false;
      let remaining = false;

      for (let i = 0; i < chars.length; i += 1) {
        const c = chars[i]!;
        if (settled.current[i]) continue;
        remaining = true;

        const elapsed = now - t0;
        if (elapsed >= c.start + c.duration) {
          glyphs.current[i] = c.final;
          settled.current[i] = true;
          changed = true;
          continue;
        }
        if (now >= (nextAt[i] ?? 0)) {
          glyphs.current[i] = pick(c.width);
          nextAt[i] = now + c.interval;
          changed = true;
        }
      }

      if (changed) setFrame((f) => f + 1);
      if (remaining) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chars]);

  if (!animate) return <span className={className}>{text}</span>;

  // Split into words so a word never breaks across lines mid-scramble.
  const words: { chars: { state: CharState; index: number }[] }[] = [];
  let current: { state: CharState; index: number }[] = [];
  chars.forEach((state, index) => {
    if (state.final === " ") {
      if (current.length) words.push({ chars: current });
      current = [];
    } else {
      current.push({ state, index });
    }
  });
  if (current.length) words.push({ chars: current });

  return (
    <span className={className}>
      {/* The real sentence, for screen readers and search engines. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-frame={frame}>
        {words.map((word, w) => (
          <span key={w} className="inline-block whitespace-nowrap">
            {word.chars.map(({ state, index }) => (
              <span key={index} className="relative inline-block">
                {/* Reserves the final glyph's width so the line can't reflow. */}
                <span className="invisible">{state.final}</span>
                <span className="absolute inset-x-0 top-0 text-center">
                  {glyphs.current[index] ?? state.final}
                </span>
              </span>
            ))}
            {w < words.length - 1 ? <span>&nbsp;</span> : null}
          </span>
        ))}
      </span>
    </span>
  );
}
