/**
 * The path for a real lens diaphragm.
 *
 * A camera iris is a ring of overlapping blades whose inner edges form a
 * POLYGON — the hole you see stopped down, and the reason out-of-focus
 * highlights in a photograph are hexagons rather than circles. It is not a
 * ring of radial spokes, which is what an earlier version drew and why it read
 * as a sparkle rather than a lens.
 *
 * Returns a single `d` for an even-odd filled path: an outer disc with a
 * polygonal hole punched through it. The hole shrinks as the iris closes, and
 * rotates slightly while it does, because real blades pivot as they sweep.
 */
const BLADES = 6;
const VIEW = 100;
const CENTRE = VIEW / 2;
const OPEN_RADIUS = 34;

export function irisPath(closed: number): string {
  const t = Math.min(1, Math.max(0, closed));
  // Never quite reaches zero: a stopped-down iris still leaves a pinhole.
  const radius = OPEN_RADIUS * (1 - t * 0.94);
  // Blades rotate as they close, which is what makes the movement read as
  // mechanical rather than as a shape being scaled.
  const spin = t * (Math.PI / BLADES);

  const outer = `M ${CENTRE} 0 A ${CENTRE} ${CENTRE} 0 1 0 ${CENTRE} ${VIEW} A ${CENTRE} ${CENTRE} 0 1 0 ${CENTRE} 0 Z`;

  let hole = "";
  for (let i = 0; i < BLADES; i += 1) {
    const angle = spin + (i / BLADES) * Math.PI * 2 - Math.PI / 2;
    const x = CENTRE + radius * Math.cos(angle);
    const y = CENTRE + radius * Math.sin(angle);
    hole += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  hole += "Z";

  return `${outer} ${hole}`;
}

/** The seams between blades, drawn from each hole vertex out to the rim. */
export function irisSeams(closed: number): string {
  const t = Math.min(1, Math.max(0, closed));
  const radius = OPEN_RADIUS * (1 - t * 0.94);
  const spin = t * (Math.PI / BLADES);
  let d = "";
  for (let i = 0; i < BLADES; i += 1) {
    const angle = spin + (i / BLADES) * Math.PI * 2 - Math.PI / 2;
    const x1 = CENTRE + radius * Math.cos(angle);
    const y1 = CENTRE + radius * Math.sin(angle);
    const x2 = CENTRE + CENTRE * Math.cos(angle);
    const y2 = CENTRE + CENTRE * Math.sin(angle);
    d += `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} `;
  }
  return d;
}
