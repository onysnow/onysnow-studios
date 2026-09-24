/**
 * The room reflected in the glass — one per page load, cycled on reload.
 *
 * Every pane on a page shows the SAME room, because every pane is in the same
 * room; giving each band its own would read as five different buildings. What
 * differs between panes is where they sit, which is already what the pointer
 * parallax and the scroll offset express.
 *
 * What changes is the visit. A reflection you have seen a hundred times stops
 * being a reflection and becomes wallpaper, so each reload hands the glass a
 * different room. Cycled, not random: random repeats about one reload in six,
 * and a reflection that fails to change is worse than one that never does,
 * because the visitor has just been given a reason to look.
 *
 * All six are photographed HDRIs, graded through one pipeline to one darkness
 * — auto-exposed so each lands at the same median luminance, so no room
 * arrives brighter than another and swamps the page it happens to land on.
 */
export const ROOMS = ["metro", "aquarium", "studio", "lobby", "fireplace", "station"] as const;

const KEY = "onysnow:room";

/**
 * Publishes `--room` on the document element. Called from an inline script in
 * the document head, BEFORE first paint — set after hydration instead, the
 * page would paint the CSS fallback and then visibly swap rooms on every
 * single load, which is precisely the thing worth avoiding.
 */
export function roomScript(sources?: readonly string[]) {
  /*
   * The URLs are baked in at render time, not looked up by the script.
   *
   * This runs in the document head before anything paints, so it cannot read
   * React Query, a settings row, or anything else that exists only after
   * hydration. The server already has the settings -- the root route awaits
   * them -- so the resolved list is passed in and serialised into the script
   * itself. Same string on the server and the client, so nothing to mismatch.
   *
   * Falls back per slot rather than all-or-nothing: replacing one room should
   * not require replacing six.
   */
  const urls = ROOMS.map((name, i) => sources?.[i] || `/rooms/${name}.jpg`);
  return (
    `(function(){try{` +
    `var r=${JSON.stringify(urls)};` +
    `var i=Math.floor(Math.random()*r.length);` +
    // localStorage throws outright in some privacy modes rather than
    // returning null, so the random pick above stands as the fallback.
    `try{var p=parseInt(localStorage.getItem(${JSON.stringify(KEY)}),10);` +
    `if(!isNaN(p))i=(p+1)%r.length;localStorage.setItem(${JSON.stringify(KEY)},String(i));}catch(e){}` +
    `document.documentElement.style.setProperty("--room",'url("'+r[i]+'")');` +
    `}catch(e){}})();`
  );
}
