import { useEffect, useState } from "react";
import { Magnifier } from "@/components/site/Magnifier";
import { FlareTorch } from "@/components/site/FlareTorch";
import { LaserBeam } from "@/components/site/LaserBeam";
import { Hammer } from "@/components/site/Hammer";
import { Flashlight } from "@/components/site/Flashlight";
import {
  heldTool,
  holdTool,
  onToolChange,
  toolTray,
  toolsOffered,
  type ToolId,
} from "@/effects/tools/held";

/** Line icons for the tray, 20 px, drawn in currentColor. */
const ICONS: Record<ToolId, React.ReactNode> = {
  lamp: (
    <>
      <path d="M7 12.5a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2V15H8v-.5c0-.8-.4-1.5-1-2Z" />
      <path d="M8 17.5h4" />
    </>
  ),
  blacklight: (
    <>
      <path d="M7 12.5a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2V15H8v-.5c0-.8-.4-1.5-1-2Z" />
      <path d="M8 17.5h4M2.5 8H4M16 8h1.5M4.5 3l1 1M15.5 3l-1 1" />
    </>
  ),
  flare: (
    <>
      <path d="M8.5 18.5 11.5 9" />
      <path d="M12 8.5c-1.6-1-1.4-3.2.4-5 .1 1.6 1.6 2 1.6 3.6 0 1.2-1 2-2 1.4Z" />
    </>
  ),
  laser: (
    <>
      <rect x="2.5" y="12" width="8" height="3" rx="1.5" transform="rotate(-30 6.5 13.5)" />
      <path d="m11 10 6.5-3.8" strokeDasharray="1.5 1.5" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.2 12.2 5 5" />
    </>
  ),
  flashlight: (
    <>
      <path d="M3 12.5 12 6.5l2 3-9 6z" />
      <path d="M12.5 5.5 15 4l2.5 4-2.5 1.5M17 3l1.5-1M18.5 6.5h1.5M16 1.2v1.6" />
    </>
  ),
  hammer: (
    <>
      <path d="M4.5 5.5 9 3l2.5 2.5L9 8z" />
      <path d="m8.5 7.5 8 8.5" />
    </>
  ),
};

/** The tray: pick up one tool, putting down the last (?try=tools). */
function Tray({ held }: { held: ToolId }) {
  return (
    <div className="tool-tray" data-tool-tray role="toolbar" aria-label="What you hold">
      {toolsOffered().map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="tool-tray__tool"
          aria-pressed={held === tool.id}
          aria-label={tool.label}
          title={tool.label}
          onClick={() => holdTool(tool.id)}
        >
          <svg
            viewBox="0 0 20 20"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[tool.id]}
          </svg>
        </button>
      ))}
    </div>
  );
}

/**
 * What the visitor holds (item 25e, effects/tools/held): the object drawn for
 * it, and the tray to change it. The lamp and the black light are the drawn
 * lamp (CustomCursor, CursorLight), which follows the hand on its own.
 */
export function HeldTool() {
  const [held, setHeld] = useState<ToolId | null>(null);
  const [tray, setTray] = useState(false);
  useEffect(() => {
    setHeld(heldTool());
    setTray(toolTray());
    return onToolChange(setHeld);
  }, []);
  if (held === null) return null;
  return (
    <>
      {held === "magnifier" ? <Magnifier /> : null}
      {held === "flare" ? <FlareTorch /> : null}
      {held === "laser" ? <LaserBeam /> : null}
      {held === "flashlight" ? <Flashlight /> : null}
      {held === "hammer" ? <Hammer /> : null}
      {tray ? <Tray held={held} /> : null}
    </>
  );
}
