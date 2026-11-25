import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui";
import { StaticCode } from "@/components/code/StaticCode";

const JOURNAL = `// journal.go — what you'll keep here
type Entry struct {
    Snippets  []Snippet   // your code, by topic
    Questions []Question  // marked green / yellow / red
    Revision  []Question  // wrong answers come back
    Plan      []Session   // today's study
}`;

/** Two-pane layout shared by sign-in, sign-up and password pages. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Code Junk`;
  }, [title]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="Code Junk home">
            <Logo />
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm animate-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {description && <p className="mt-2 text-sm leading-relaxed text-ink-2">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-center text-sm text-ink-2">{footer}</div>}
          </div>
        </main>
      </div>

      <aside
        aria-hidden
        className="relative hidden flex-col justify-between overflow-hidden border-l border-line bg-surface-2 p-10 lg:flex"
      >
        <div className="cj-ruled pointer-events-none absolute inset-0 opacity-60" />
        <p className="relative font-mono text-xs text-muted">// your code. your knowledge. your journey.</p>
        <div className="relative">
          <StaticCode code={JOURNAL} className="rounded-lg border border-line bg-surface shadow-md" />
          <p className="mt-8 max-w-sm text-lg leading-snug font-medium tracking-tight text-ink">
            Code Junk remembers your learning journey, so you can focus on the learning.
          </p>
        </div>
        <p className="relative text-xs text-muted">Your data is private to your account.</p>
      </aside>
    </div>
  );
}
