import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

/**
 * The routes that exist but are not in the navigation.
 *
 * They are not secret and not protected -- anyone who types the path gets
 * them, and /lab deliberately carries a noindex so it stays out of search
 * rather than out of reach. What they are is not part of the site's story:
 * putting "Lab" between "Journal" and "About" would tell a visitor looking to
 * book a photographer something true and useless.
 *
 * So they live behind a disclosure in the header instead of in someone's
 * bookmarks, which is where undiscoverable routes actually end up.
 */
const HIDDEN = [
  /*
   * The studio, first, because it is the only thing here that is WORK.
   *
   * Ten admin routes existed -- photographs, categories, posts, pages,
   * services, settings, inquiries, subscribers, testimonials, advanced -- and
   * nothing in the interface linked to any of them. The only way in was
   * typing the URL, which is exactly the "undiscoverable route" this
   * disclosure exists to stop. It leads to a sign-in for anyone who is not
   * already an admin, so listing it costs nothing.
   */
  { to: "/admin", label: "Studio", note: "Photographs, pages, inquiries — everything editable" },
  { to: "/lab", label: "Lab", note: "Every knob in the effect layer, over the real thing" },
  { to: "/duo", label: "Duo", note: "Two-photographer page" },
  { to: "/privacy", label: "Privacy", note: "Policy" },
  { to: "/terms", label: "Terms", note: "Policy" },
] as const;

export function DevNav() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  /*
   * Closes on outside click and on Escape.
   *
   * Written by hand rather than reaching for the Popover primitive, because
   * that one renders into a portal at the end of the body -- outside the
   * header's stacking context, and therefore outside the pane. A menu that
   * belongs to a sheet of glass should be on that glass.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="dev-nav__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More pages"
      >
        <span aria-hidden="true" className="dev-nav__dots" />
      </button>

      {open ? (
        <div role="menu" className="dev-nav__menu glass" aria-label="More pages">
          {HIDDEN.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="dev-nav__item"
              activeProps={{ className: "dev-nav__item is-active" }}
            >
              <span className="dev-nav__label">{item.label}</span>
              <span className="dev-nav__note">{item.note}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
