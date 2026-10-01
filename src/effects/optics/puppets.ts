/**
 * Shadow puppets (item 83; docs/research/shadows.md 6 "Build for task 83").
 *
 * A puppet is a cut-out standing in the lamp's light at its own height above
 * the photograph: it is not drawn (the audience of a shadow show sees the
 * screen, not the puppets), it only casts. The floor works its shadow out
 * like any other caster's (effects/optics/casters): projected from the lamp,
 * magnified by H / (H - h), its edge softened by the lamp's size over that
 * height, and coloured by what a translucent puppet lets through (dyed hide,
 * coloured cellophane: Exploratorium, "Colored Shadows",
 * https://www.exploratorium.edu/snacks/colored-shadows).
 *
 * Shapes are drawn in a 100 x 100 box, centred on (50, 50); each puppet is
 * placed by its centre, size and turn, in viewport CSS pixels.
 */

/** One puppet, as the caster mask needs it this frame. */
export type Puppet = {
  readonly id: string;
  /** Its outline, in a 100 x 100 box; holes by the even-odd rule. */
  path: Path2D;
  /** Its centre, viewport CSS px. */
  x: number;
  y: number;
  /** How wide the 100-unit box is drawn, CSS px. */
  size: number;
  /** Its turn, radians. */
  angle: number;
  /** Mirrored left to right (a bird flying the other way). */
  flip?: boolean;
  /** How high above the photograph it is held, CSS px (0 = on the screen). */
  height: number;
  /** What light it lets through where it covers: 0 for an opaque puppet, its colour for a coloured one. */
  tint: readonly [number, number, number];
};

const puppets = new Set<Puppet>();

let roomFill = 1;
/** While a stage is lit, how much of the room's light is left (the house lights down); 1 with no stage. */
export function stageRoomFill(): number {
  return roomFill;
}
/** A stage sets how dark the room goes while it plays (1: no change). */
export function setStageRoomFill(v: number) {
  roomFill = Math.max(0, Math.min(1, v));
}

/** Add a puppet to the stage (returns the removal). */
export function addPuppet(p: Puppet): () => void {
  puppets.add(p);
  return () => {
    puppets.delete(p);
  };
}

/** The puppets on the stage now. */
export function puppetList(): readonly Puppet[] {
  return [...puppets];
}

/**
 * The deepest a puppet may be held: 0.85 of the lamp's height, a
 * magnification of 6.7, about the largest a real show uses (ShadowLight's
 * 5-7.5; docs/research/shadows.md 6, computed).
 */
export const PUPPET_MAX_DEPTH = 0.85;

/** How much larger the shadow of something at height h is than the thing, lamp at height H. */
export function magnification(h: number, H: number): number {
  return H / Math.max(H - h, 1e-3);
}

/** Where the shadow of a point at (x, y), height h, lands on the photograph: projected from the lamp at (lx, ly), height H. */
export function shadowOf(
  x: number,
  y: number,
  h: number,
  lx: number,
  ly: number,
  H: number,
): [number, number] {
  const k = magnification(h, H);
  return [lx + (x - lx) * k, ly + (y - ly) * k];
}

/**
 * Where to hold a puppet, and how big, for its shadow to land centred at
 * (sx, sy) at `shadowSize` across, held at height h with the lamp at
 * (lx, ly), height H: the inverse of shadowOf. A puppeteer works the same
 * way, watching the screen, not the puppet.
 */
export function holdFor(
  sx: number,
  sy: number,
  shadowSize: number,
  h: number,
  lx: number,
  ly: number,
  H: number,
): { x: number; y: number; size: number } {
  const k = magnification(h, H);
  return { x: lx + (sx - lx) / k, y: ly + (sy - ly) / k, size: shadowSize / k };
}

/*
 * The outlines. Original, simple silhouettes in the 100-unit box -- the kind
 * a shadow-puppet maker cuts from card.
 */

/** A bird in flight, its wings at `flap` (-1 down to 1 up). */
export function birdPath(flap: number): string {
  const up = Math.max(-1, Math.min(1, flap));
  // Wing tips swing about the shoulder (50, 52).
  const tipY = 52 - 34 * up;
  const tipBack = 50 - 6 * up;
  return [
    // Body: tail at the left, head and beak to the right.
    "M14 50 L26 47 Q40 43 56 46 Q66 44 72 40 Q78 37 82 40 L92 42 L82 45 Q78 50 70 52 Q58 58 40 56 L26 55 L12 60 Z",
    // Near wing.
    `M44 49 Q${tipBack - 6} ${tipY - 4 * up} ${tipBack - 12} ${tipY} Q${tipBack + 4} ${tipY + 10 * up + 4} 58 50 Z`,
  ].join(" ");
}

/** A tree: a trunk and a round crown, a gap of sky through it. */
export const TREE_PATH =
  "M46 96 L47 64 Q30 66 22 54 Q12 40 24 28 Q26 12 44 10 Q58 2 70 14 Q86 18 82 36 Q92 50 76 60 Q66 66 53 64 L54 96 Z " +
  // A gap in the leaves (even-odd: a hole).
  "M52 30 Q58 26 62 32 Q60 38 54 37 Q50 35 52 30 Z";

/** A house, its window cut out (a coloured window is its own puppet, WINDOW_PATH). */
export const HOUSE_PATH =
  "M14 92 L14 50 L50 18 L86 50 L86 92 Z M58 56 L74 56 L74 72 L58 72 Z M26 92 L26 66 L40 66 L40 92 Z";

/** The house's window pane, for a coloured-cellophane puppet set in its cut-out. */
export const WINDOW_PATH = "M58 56 L74 56 L74 72 L58 72 Z";

/** A crescent moon. */
export const MOON_PATH = "M62 12 A40 40 0 1 0 62 88 A32 32 0 1 1 62 12 Z";

/** A light that sits through a translucent amber puppet: amber cellophane passes red and some green (estimate). */
export const AMBER: readonly [number, number, number] = [1.0, 0.62, 0.16];
/** A warm window. */
export const WINDOW_YELLOW: readonly [number, number, number] = [1.0, 0.82, 0.3];
