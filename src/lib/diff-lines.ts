/**
 * Line-by-line diff for the advanced editor's preview.
 *
 * Lived in CodeEditor.tsx beside the component. That is a pure function with
 * no JSX in it, and mixing the two means React Fast Refresh cannot hot-reload
 * the file -- it cannot tell whether a changed export is a component whose
 * state it should preserve or a helper it should simply replace, so it
 * reloads the whole module and drops the editor's state. Its own file now.
 */

export function diffLines(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const out: { type: "same" | "removed" | "added"; text: string }[] = [];
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) out.push({ type: "same", text: left });
      continue;
    }
    if (left !== undefined) out.push({ type: "removed", text: left });
    if (right !== undefined) out.push({ type: "added", text: right });
  }
  return out;
}
