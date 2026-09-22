import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Substitutes drawn from living writing systems, so the settling text reads as
 * *languages* rather than as random symbols.
 *
 * Glyphs render at their natural width and the line's letter spacing shifts
 * while the sequence runs, which is intended. That removes the need to match
 * advance widths, which is what previously kept Chinese, Japanese and the Indic
 * scripts out — every script can take part now.
 */
const GLYPHS = [
  // Greek
  "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ", "Φ", "Ψ", "Ω",
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω",
  // Cyrillic
  "Б", "Г", "Д", "Ж", "З", "И", "Й", "Л", "П", "Ф", "Ц", "Ч", "Ш", "Щ", "Э", "Ю", "Я",
  "б", "в", "г", "д", "ж", "з", "и", "й", "к", "л", "н", "п", "т", "ф", "ц", "ч", "ш", "э", "я",
  // Armenian
  "Թ", "Ի", "Ղ", "Շ", "Ճ", "Ձ", "Ծ", "ա", "բ", "գ", "դ", "ե", "զ", "ը", "ի", "լ",
  // Georgian
  "გ", "ზ", "ო", "შ", "წ", "ჭ", "ჰ", "ე", "ვ", "ლ", "მ", "ნ",
  // Hebrew
  "א", "ב", "ג", "ד", "ה", "ז", "ח", "ט", "כ", "ל", "מ", "נ", "ס", "ע", "צ", "ק", "ר", "ש", "ת",
  // Arabic
  "ش", "ط", "غ", "ف", "ل", "ن", "ه", "ي", "ج", "ح", "خ", "ص", "ض", "ع",
  // Devanagari
  "क", "ग", "घ", "झ", "ण", "ध", "भ", "ष", "स", "ह", "म", "य", "र", "ल",
  // Thai
  "ก", "ง", "ฎ", "ธ", "ภ", "ม", "ย", "ร", "ล", "ว", "ส", "ห",
  // Japanese hiragana
  "あ", "え", "き", "さ", "た", "な", "は", "ま", "よ", "ら", "を", "ん", "ゆ", "め",
  // Japanese katakana
  "ア", "カ", "サ", "タ", "ナ", "ハ", "マ", "ヤ", "ラ", "ワ", "ヲ", "ン", "ミ", "ホ",
  // Chinese / kanji
  "光", "心", "水", "火", "山", "日", "月", "人", "見", "花", "空", "生",
  "色", "音", "時", "風", "雨", "門", "文", "本", "海", "夢", "愛", "記",
  // Korean jamo
  "ㄱ", "ㄴ", "ㄷ", "ㅁ", "ㅅ", "ㅋ", "ㅎ", "ㅍ",
];

const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "Δ";

/**
 * Chinese, Japanese and Korean characters are full-width — about twice a Latin
 * letter's advance. Left at full size they widen the line enough to wrap it onto
 * an extra row mid-sequence, which collides with whatever sits below. Rendering
 * them at 0.62em brings their advance back near a Latin letter's, so the line
 * stays roughly its finished width and wraps the same way.
 */
const FULL_WIDTH = /[\u3040-\u30ff\u3100-\u312f\u3130-\u318f\u4e00-\u9fff]/;

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
};

/** Punctuation and whitespace stay put, so the sentence keeps its shape throughout. */
function animatable(ch: string) {
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * The whole sentence is present from the first frame; each letter cycles through
 * other writing systems on its own clock and lands in English at its own moment.
 *
 * Hand-rolled rather than using `use-scramble`, which advances a single scramble
 * head left to right at one global speed — per-character start, speed and settle
 * time need per-character state.
 *
 * Glyph widths differ, so letter spacing shifts while it runs. An invisible copy
 * of the finished sentence underneath reserves the final block size, so the
 * headline's own footprint never changes and nothing below it jumps.
 */
export function ScrambleText({
  text,
  className,
  /** Roughly how long until the last letter settles, in ms. */
  totalMs = 1500,
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
    return Array.from(text).map((final) => {
      const animates = animatable(final);
      return {
        final,
        animates,
        // Starts spread across the first third, settles across the rest, so
        // letters neither move in unison nor finish together.
        start: animates ? Math.random() * totalMs * 0.3 : 0,
        duration: animates ? totalMs * (0.4 + Math.random() * 0.6) : 0,
        // 80–240ms per change: each substitute still registers as a letter.
        interval: 80 + Math.random() * 160,
      };
    });
  }, [text, totalMs]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);

    glyphs.current = chars.map((c) => (c.animates ? pick() : c.final));
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

        if (now - t0 >= c.start + c.duration) {
          glyphs.current[i] = c.final;
          settled.current[i] = true;
          changed = true;
          continue;
        }
        if (now >= (nextAt[i] ?? 0)) {
          glyphs.current[i] = pick();
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

  return (
    <span className={cn("relative block", className)}>
      {/* Reserves the finished sentence's block size so nothing below it jumps. */}
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      {/* The real sentence, for screen readers and search engines. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-frame={frame} className="absolute inset-0">
        {chars.map((state, index) => {
          const g = glyphs.current[index] ?? state.final;
          return FULL_WIDTH.test(g) ? (
            <span key={index} className="text-[0.62em]">
              {g}
            </span>
          ) : (
            <span key={index}>{g}</span>
          );
        })}
      </span>
    </span>
  );
}
