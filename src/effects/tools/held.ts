import { previewing } from "@/effects/engine/preview";

/**
 * What the visitor is holding (item 25e, claude/tools-research.md §3.2).
 *
 * One thing at a time, as with two hands and a camera: the lamp, the black
 * light, a road flare, a laser pointer or a magnifying glass. The camera --
 * the shutter and its flash -- is not a tool; it is the viewer, and fires
 * whatever is held.
 *
 * A tool is a light, an optical object, or both. This module only says which
 * one is in the hand and what light that puts in the scene; the lights
 * themselves stay in effects/light, the objects in their components.
 *
 * Which tool is held first comes from the address: `?try=blacklight`,
 * `?try=flare`, `?try=laser` or `?try=magnifier` start with it; `?try=tools`
 * shows the tray to change it.
 */

export type ToolId = "lamp" | "blacklight" | "flare" | "laser" | "magnifier" | "hammer";

export type Tool = {
  id: ToolId;
  label: string;
  /**
   * The lamp's part in it: "white" the lamp's own light, "uv" the black
   * light's, none if the hand holds something else instead. The magnifier
   * is an illuminated one -- a ring of light round the lens, as a reading
   * magnifier has -- so the lamp stays with it.
   */
  lamp: "white" | "uv" | null;
  /**
   * Whether the lamp is seen as the lamp (the drawn lamp: its core and the
   * camera's flare round it). In the magnifier it is a ring in the rim,
   * which the magnifier draws itself.
   */
  lampSeen: boolean;
};

export const TOOLS: readonly Tool[] = [
  { id: "lamp", label: "Lamp", lamp: "white", lampSeen: true },
  { id: "blacklight", label: "Black light", lamp: "uv", lampSeen: true },
  { id: "flare", label: "Flare", lamp: null, lampSeen: false },
  { id: "laser", label: "Laser", lamp: null, lampSeen: false },
  { id: "magnifier", label: "Magnifier", lamp: "white", lampSeen: false },
  /*
   * A glazier's hammer, to break a pane (item 10, ?try=broken): a strike
   * is a moment, so the lamp stays in the other hand to see the cracks by.
   */
  { id: "hammer", label: "Hammer", lamp: "white", lampSeen: true },
];

const byId = new Map(TOOLS.map((t) => [t.id, t]));

let held: ToolId | null = null;
const watchers = new Set<(id: ToolId) => void>();

/** The tool the address starts with, the lamp if none. */
function initialTool(): ToolId {
  for (const id of ["blacklight", "flare", "laser", "magnifier"] as const) {
    if (previewing(id)) return id;
  }
  return "lamp";
}

/** What is in the hand now. */
export function heldTool(): ToolId {
  if (held === null) {
    if (typeof window === "undefined") return "lamp";
    held = initialTool();
  }
  return held;
}

/** Put down what is held and pick up another. */
export function holdTool(id: ToolId) {
  if (heldTool() === id) return;
  held = id;
  for (const fn of watchers) fn(id);
}

/** Watch the hand (returns the unwatch). */
export function onToolChange(fn: (id: ToolId) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

/** The lamp's part in what is held: "white", "uv", or null if the lamp is put down. */
export function lampMode(): Tool["lamp"] {
  const tool = byId.get(heldTool());
  return tool ? tool.lamp : "white";
}

/** Whether the lamp is drawn as the lamp (not inside a magnifier's rim, nor put down). */
export function lampSeen(): boolean {
  return byId.get(heldTool())?.lampSeen ?? true;
}

/** Whether the tray is shown (?try=tools, or ?try=broken for the hammer). */
export function toolTray(): boolean {
  return previewing("tools") || previewing("broken");
}

/** The tools on offer: the hammer only while breaking glass is being tried (?try=broken). */
export function toolsOffered(): readonly Tool[] {
  return TOOLS.filter((t) => t.id !== "hammer" || previewing("broken"));
}

/** For tests: put the hand back as a fresh page load would find it. */
export function resetTool(id: ToolId | null = null) {
  held = id;
}
