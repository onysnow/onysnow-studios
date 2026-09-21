import { useEffect, useRef, useState } from "react";
import { useScramble } from "use-scramble";

/**
 * Characters drawn from living writing systems — Greek, Cyrillic, Armenian, Hebrew,
 * Arabic, Devanagari, Thai, Georgian, Japanese kana and Korean jamo — so the
 * settling text reads as *languages* rather than as random symbols.
 */
const GLYPHS: number[] = [
  // Greek
  0x0393, 0x0394, 0x0398, 0x039b, 0x039e, 0x03a0, 0x03a3, 0x03a6, 0x03a8, 0x03a9,
  // Cyrillic
  0x0414, 0x0416, 0x0417, 0x0419, 0x041b, 0x0424, 0x0426, 0x0428, 0x042d, 0x042f,
  // Armenian
  0x0539, 0x053b, 0x0542, 0x0547, 0x054b,
  // Hebrew
  0x05d0, 0x05d2, 0x05d6, 0x05db, 0x05e9,
  // Arabic
  0x0634, 0x0637, 0x063a, 0x0641, 0x0644, 0x0646,
  // Devanagari
  0x0915, 0x0917, 0x091d, 0x0923, 0x0927, 0x092d, 0x0937,
  // Thai
  0x0e01, 0x0e07, 0x0e0e, 0x0e18, 0x0e20,
  // Georgian
  0x10d2, 0x10d6, 0x10dd, 0x10e8,
  // Japanese kana
  0x3042, 0x3048, 0x304b, 0x3055, 0x305f, 0x306a, 0x307e, 0x3088, 0x30a2, 0x30ab,
  0x30b5, 0x30c6, 0x30cd, 0x30d5, 0x30e8, 0x30ef,
  // Korean jamo
  0x3131, 0x3134, 0x3137, 0x3141, 0x3145, 0x314b,
];

/**
 * Renders `text` with each character cycling through other writing systems before
 * settling. Letters resolve left to right at a staggered pace rather than all at once.
 *
 * The real text stays in the DOM for screen readers and search engines; the animated
 * layer is aria-hidden, so the effect costs nothing in accessibility or SEO.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [animate, setAnimate] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Respect users who have asked for less motion — they get the text, plainly.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || started.current) return;
    started.current = true;
    setAnimate(true);
  }, []);

  const { ref } = useScramble({
    text,
    playOnMount: true,
    speed: 0.55,
    tick: 2,
    step: 1,
    scramble: 7,
    seed: 2,
    chance: 0.9,
    overdrive: false,
    overflow: false,
    range: GLYPHS as unknown as [number, number],
  });

  if (!animate) return <span className={className}>{text}</span>;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" ref={ref} className={className} />
    </>
  );
}
