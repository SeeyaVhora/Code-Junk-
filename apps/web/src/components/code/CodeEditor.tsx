import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import { Check, Copy, Eraser, Maximize2, Minimize2, Search, WandSparkles } from "lucide-react";
import { openSearchPanel } from "@codemirror/search";
import { cn } from "@/lib/cn";
import { languageLabel } from "@code-junk/shared";
import { languageExtension } from "./languages";

/** Editor colours come from the design tokens, so light/dark switch automatically. */
const theme = EditorView.theme({
  "&": { backgroundColor: "var(--code-bg)", color: "var(--ink)", fontSize: "13px" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent-soft) 45%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-2)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--ink)", borderColor: "var(--line)" },
  ".cm-panels input, .cm-panels button": { fontSize: "12px" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--mark-yellow) 30%, transparent)" },
  "&.cm-focused": { outline: "none" },
});
const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "var(--syn-keyword)" },
    { tag: [t.typeName, t.className, t.namespace, t.bool, t.null], color: "var(--syn-type)" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syn-fn)" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
    { tag: [t.number, t.atom], color: "var(--syn-number)" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
    { tag: [t.tagName], color: "var(--syn-keyword)" },
    { tag: [t.attributeName, t.propertyName], color: "var(--syn-fn)" },
  ]),
);

function format(code: string, language: string) {
  if (language === "json") return JSON.stringify(JSON.parse(code), null, 2);
  return null;
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  minHeight = "220px",
  maxHeight,
  className,
  ariaLabel = "Code",
}: {
  value: string;
  onChange?: (v: string) => void;
  language: string | null | undefined;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [lang, setLang] = useState<Extension[]>([]);
  const [view, setView] = useState<EditorView | null>(null);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void languageExtension(language).then((ext) => alive && setLang(ext));
    return () => {
      alive = false;
    };
  }, [language]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const doFormat = () => {
    try {
      const out = format(value, language ?? "");
      if (out !== null) onChange?.(out);
      setFormatError(null);
    } catch {
      setFormatError("Couldn't format: the JSON isn't valid.");
    }
  };
  const tool = "inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-3.5";

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-code-bg", full && "fixed inset-3 z-50 flex flex-col shadow-lg sm:inset-6", className)}>
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1">
        <span className="mr-auto px-1 font-mono text-[11px] text-muted">{languageLabel(language) || "Plain text"}</span>
        <button type="button" className={tool} onClick={() => view && openSearchPanel(view)} title="Search (Ctrl+F)">
          <Search /> <span className="hidden sm:inline">Search</span>
        </button>
        {!readOnly && language === "json" && (
          <button type="button" className={tool} onClick={doFormat}>
            <WandSparkles /> <span className="hidden sm:inline">Format</span>
          </button>
        )}
        {!readOnly && (
          <button type="button" className={tool} onClick={() => onChange?.("")} disabled={!value}>
            <Eraser /> <span className="hidden sm:inline">Clear</span>
          </button>
        )}
        <button type="button" className={tool} onClick={() => void copy()} aria-live="polite">
          {copied ? <Check /> : <Copy />} <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
        <button type="button" className={tool} onClick={() => setFull((f) => !f)} aria-label={full ? "Exit full screen" : "Full screen"}>
          {full ? <Minimize2 /> : <Maximize2 />}
        </button>
      </div>
      {formatError && <p className="border-b border-line bg-mark-red-soft px-3 py-1.5 text-xs text-mark-red">{formatError}</p>}
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={setView}
        readOnly={readOnly}
        editable={!readOnly}
        theme="none"
        extensions={[theme, highlight, EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": ariaLabel }), ...lang]}
        basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false }}
        minHeight={full ? undefined : minHeight}
        maxHeight={full ? undefined : maxHeight}
        height={full ? "100%" : undefined}
        className={cn(full && "min-h-0 flex-1 [&_.cm-editor]:h-full")}
      />
    </div>
  );
}
