import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { useMemo } from "react";

export function CodeEditor({
  value,
  onChange,
  language,
  height = "420px",
}: {
  value: string;
  onChange: (next: string) => void;
  language: "json" | "css";
  height?: string;
}) {
  const extensions = useMemo(() => [language === "json" ? json() : css()], [language]);
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card font-mono text-sm">
      <CodeMirror
        value={value}
        height={height}
        theme="dark"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: true, bracketMatching: true, autocompletion: true }}
      />
    </div>
  );
}

/** Line-level diff between the saved and edited text, for the confirm step. */
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
