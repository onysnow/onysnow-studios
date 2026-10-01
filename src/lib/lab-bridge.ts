import { heldTool, holdTool, onToolChange, TOOLS, type ToolId } from "@/effects/tools/held";
import { applySiteTuning } from "@/lib/tuning";
import { setGlassMode, type GlassMode } from "@/lib/glass-mode";
import { enterRedRoom } from "@/effects/secrets/red-room";

/**
 * The lab's live preview: the editor at /lab and the real page in its frame.
 *
 * The lab is laid out like an app builder -- controls on the left, the actual
 * site on the right -- and the site in the frame is a separate window with its
 * own copy of every module, so moving a slider in the editor changes nothing
 * there by itself. This is the wire between them: the editor posts its draft
 * tuning into the frame, and the frame applies it exactly the way every
 * visitor's browser applies the published tuning (applySiteTuning), so what
 * the preview shows is what "Save for everyone" will publish.
 *
 * Only a same-origin parent is listened to. A page of ours framed by anyone
 * else ignores every message: the origin check is on the message, and the
 * source check means a sibling frame cannot pose as the editor.
 */

export type LabMessage =
  | { type: "onysnow:lab-draft"; tuning: string; glass: GlassMode }
  | { type: "onysnow:lab-ready"; path: string; tool: ToolId }
  | { type: "onysnow:lab-path"; path: string }
  /** Editor to frame: pick up this tool (item 25h). */
  | { type: "onysnow:lab-hold"; tool: ToolId }
  /** Frame to editor: the hand changed (the page's own tray, say). */
  | { type: "onysnow:lab-tool"; tool: ToolId }
  /** Editor to frame: straight into the red room (item 39), as if a photograph were taken. */
  | { type: "onysnow:lab-redroom" };

/** Whether a value names one of the tools. */
export function isToolId(value: unknown): value is ToolId {
  return TOOLS.some((t) => t.id === value);
}

let draftActive = false;

/**
 * True once the editor has sent this page a draft. The published tuning must
 * not then be applied over it (CustomCss), or the preview would snap back to
 * what is live every time the settings refetch.
 */
export function labDraftActive(): boolean {
  return draftActive;
}

function framed(): boolean {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return false;
  }
}

function toEditor(message: LabMessage) {
  if (!framed()) return;
  try {
    window.parent.postMessage(message, window.location.origin);
  } catch {
    // A parent of another origin: the target origin refuses it, as it should.
  }
}

let listening = false;

/**
 * In the frame: take the editor's draft, and tell it when the page is ready
 * for one. Installed once, at the root; a no-op for a page that is not framed.
 */
export function listenForLabDraft() {
  if (listening || !framed()) return;
  listening = true;
  window.addEventListener("message", (event: MessageEvent<LabMessage>) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data) return;
    if (data.type === "onysnow:lab-hold") {
      if (isToolId(data.tool)) holdTool(data.tool);
      return;
    }
    if (data.type === "onysnow:lab-redroom") {
      enterRedRoom(largestPhotoInView());
      return;
    }
    if (data.type !== "onysnow:lab-draft") return;
    draftActive = true;
    applySiteTuning(data.tuning);
    if (data.glass === "css" || data.glass === "raster") setGlassMode(data.glass);
  });
  onToolChange((tool) => toEditor({ type: "onysnow:lab-tool", tool }));
  toEditor({ type: "onysnow:lab-ready", path: window.location.pathname, tool: heldTool() });
}

/**
 * The photograph most in view, as a picture to hang in the red room: the
 * one the shutter would most likely have been fired at.
 */
function largestPhotoInView(): string | null {
  let best: string | null = null;
  let area = 0;
  for (const img of document.querySelectorAll<HTMLImageElement>("[data-photo] img")) {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:")) continue;
    const r = img.getBoundingClientRect();
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (w > 0 && h > 0 && w * h > area) {
      area = w * h;
      best = src;
    }
  }
  return best;
}

/** In the frame: say where the page has navigated to, for the editor's address bar. */
export function reportLabPath(path: string) {
  toEditor({ type: "onysnow:lab-path", path });
}

/** In the editor: send the draft into the frame. */
export function sendLabDraft(frame: HTMLIFrameElement | null, tuning: string, glass: GlassMode) {
  const target = frame?.contentWindow;
  if (!target) return;
  const message: LabMessage = { type: "onysnow:lab-draft", tuning, glass };
  target.postMessage(message, window.location.origin);
}

/** In the editor: put a tool in the preview's hand (item 25h). */
export function sendLabHold(frame: HTMLIFrameElement | null, tool: ToolId) {
  const target = frame?.contentWindow;
  if (!target) return;
  const message: LabMessage = { type: "onysnow:lab-hold", tool };
  target.postMessage(message, window.location.origin);
}

/** In the editor: take the preview into the red room. */
export function sendLabRedRoom(frame: HTMLIFrameElement | null) {
  const target = frame?.contentWindow;
  if (!target) return;
  const message: LabMessage = { type: "onysnow:lab-redroom" };
  target.postMessage(message, window.location.origin);
}

/** In the editor: messages from its own frame only. */
export function isFromFrame(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): event is MessageEvent<LabMessage> {
  return (
    event.origin === window.location.origin &&
    frame !== null &&
    event.source === frame.contentWindow &&
    typeof event.data === "object" &&
    event.data !== null &&
    typeof (event.data as { type?: unknown }).type === "string" &&
    String((event.data as { type: string }).type).startsWith("onysnow:lab-")
  );
}
