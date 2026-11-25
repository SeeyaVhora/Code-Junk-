import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

/** Lazily loads the CodeMirror language support for a Code Junk language id. */
export async function languageExtension(id: string | null | undefined): Promise<Extension[]> {
  switch (id) {
    case "javascript":
      return [(await import("@codemirror/lang-javascript")).javascript()];
    case "typescript":
      return [(await import("@codemirror/lang-javascript")).javascript({ typescript: true })];
    case "python":
      return [(await import("@codemirror/lang-python")).python()];
    case "java":
      return [(await import("@codemirror/lang-java")).java()];
    case "c":
    case "cpp":
      return [(await import("@codemirror/lang-cpp")).cpp()];
    case "go":
      return [(await import("@codemirror/lang-go")).go()];
    case "rust":
      return [(await import("@codemirror/lang-rust")).rust()];
    case "php":
      return [(await import("@codemirror/lang-php")).php()];
    case "sql":
      return [(await import("@codemirror/lang-sql")).sql()];
    case "html":
      return [(await import("@codemirror/lang-html")).html()];
    case "css":
      return [(await import("@codemirror/lang-css")).css()];
    case "json":
      return [(await import("@codemirror/lang-json")).json()];
    case "markdown":
      return [(await import("@codemirror/lang-markdown")).markdown()];
    case "bash":
      return [StreamLanguage.define((await import("@codemirror/legacy-modes/mode/shell")).shell)];
    case "ruby":
      return [StreamLanguage.define((await import("@codemirror/legacy-modes/mode/ruby")).ruby)];
    case "csharp":
      return [StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).csharp)];
    case "kotlin":
      return [StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).kotlin)];
    default:
      return [];
  }
}
