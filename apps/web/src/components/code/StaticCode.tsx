import { Fragment } from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight read-only highlighter for marketing previews and tiny inline samples.
 * The real editor (Phase 4) uses CodeMirror 6 with the same --syn-* tokens.
 */
const KEYWORDS = new Set([
  "func", "type", "struct", "interface", "var", "const", "return", "if", "else", "for", "range",
  "package", "import", "go", "def", "class", "while", "in", "let", "fn", "pub", "public", "static",
]);
const TYPES = new Set(["float64", "int", "string", "bool", "error", "void", "None", "True", "False"]);

const TOKEN = /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)|(\s+)|(.)/gm;

function highlight(line: string) {
  const out: { t: string; c?: string }[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const [text, comment, str, num, ident] = m;
    if (comment) out.push({ t: text, c: "text-syn-comment italic" });
    else if (str) out.push({ t: text, c: "text-syn-string" });
    else if (num) out.push({ t: text, c: "text-syn-number" });
    else if (ident) {
      const next = line[(m.index ?? 0) + text.length];
      if (KEYWORDS.has(text)) out.push({ t: text, c: "text-syn-keyword" });
      else if (TYPES.has(text) || /^[A-Z]/.test(text)) out.push({ t: text, c: "text-syn-type" });
      else if (next === "(") out.push({ t: text, c: "text-syn-fn" });
      else out.push({ t: text });
    } else out.push({ t: text });
  }
  return out;
}

export function StaticCode({
  code,
  className,
  showLineNumbers = true,
  highlightLines = [],
}: {
  code: string;
  className?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <pre className={cn("overflow-x-auto bg-code-bg py-3 font-mono text-[12.5px] leading-[1.7] text-ink", className)}>
      <code>
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn("flex pr-4", highlightLines.includes(i + 1) && "bg-accent-soft/70")}
          >
            {showLineNumbers && (
              <span className="w-9 shrink-0 pr-3 text-right text-muted/70 select-none">{i + 1}</span>
            )}
            <span className={cn(!showLineNumbers && "pl-4")}>
              {highlight(line).map((tok, j) => (
                <Fragment key={j}>{tok.c ? <span className={tok.c}>{tok.t}</span> : tok.t}</Fragment>
              ))}
              {line === "" && " "}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}
