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
      {/*
        Tab must not be captured.

        `@uiw/react-codemirror` defaults `indentWithTab` to true, so Tab
        indents and Shift+Tab dedents, and nothing binds Escape to blur — a
        keyboard user who tabs in cannot get back out to Apply or Discard,
        which sit immediately below. That is a WCAG 2.1.2 keyboard trap, the
        one Level A failure in the codebase. Losing tab-indentation in a CSS
        box is a small price.
      */}
      <CodeMirror
        indentWithTab={false}
        value={value}
        height={height}
        theme="dark"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          autocompletion: true,
        }}
      />
    </div>
  );
}

/** Line-level diff between the saved and edited text, for the confirm step. */
