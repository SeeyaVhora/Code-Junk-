import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  Home,
  Library,
  LineChart,
  Menu,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge, Kbd, MarkDot } from "@/components/ui";
import { StaticCode } from "@/components/code/StaticCode";
import { cn } from "@/lib/cn";

/**
 * Static product preview for the landing page, composed from the real UI kit.
 * Content is illustrative sample data, clearly scoped to this marketing preview.
 */

const SAMPLE_GO = `type Shape interface {
    Area() float64
}

type Square struct{ side float64 }

func (s Square) Area() float64 {
    return s.side * s.side
}

func main() {
    var sh Shape = Square{3}
    fmt.Println(sh.Area())
}`;

const nav = [
  { icon: Home, label: "Home", active: true },
  { icon: BookOpen, label: "Code Booklet" },
  { icon: Sparkles, label: "AI Practice" },
  { icon: Library, label: "Question Library" },
  { icon: FileText, label: "Practice Papers" },
  { icon: ClipboardList, label: "Planner" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: LineChart, label: "Progress" },
];

const plan = [
  { subject: "Go", topic: "Interfaces", mins: "45 min", done: true },
  { subject: "DSA", topic: "Linked lists", mins: "30 min", done: false },
  { subject: "Mathematics", topic: "Probability", mins: "1 h", done: false },
];

const deadlines = [
  { title: "DBMS mid-semester exam", when: "in 3 days", cat: "bg-cat-exam" },
  { title: "OS assignment 2", when: "Fri, 23:59", cat: "bg-cat-assignment" },
  { title: "College hackathon", when: "Sat", cat: "bg-cat-college" },
];

const week = [
  { d: "M", h: 1.5 },
  { d: "T", h: 2.25 },
  { d: "W", h: 0.75 },
  { d: "T", h: 2.75 },
  { d: "F", h: 0 },
  { d: "S", h: 0 },
  { d: "S", h: 0 },
];

export function ProductPreview({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Preview of the Code Junk dashboard: today's learning plan, a Go practice question marked as understood, and upcoming deadlines."
      className={cn(
        "overflow-hidden rounded-xl border border-line-strong bg-paper text-left shadow-lg select-none",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none">
        {/* Top bar */}
        <div className="flex h-11 items-center gap-3 border-b border-line bg-surface px-3">
          <Menu className="size-4 text-ink-2" />
          <span className="text-[13px] font-semibold tracking-tight">Code Junk</span>
          <div className="mx-auto hidden h-7 w-64 items-center gap-2 rounded-md border border-line bg-paper px-2.5 text-xs text-muted sm:flex">
            <Search className="size-3.5" />
            Search snippets, questions…
            <Kbd className="ml-auto">⌘K</Kbd>
          </div>
          <div className="ml-auto flex size-6 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-ink sm:ml-0">
            SR
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside className="hidden w-44 shrink-0 border-r border-line bg-surface/60 p-2 lg:block">
            {nav.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px]",
                  active ? "bg-surface-2 font-medium text-ink" : "text-ink-2",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] text-muted">Thursday, 26 November</p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-tight">Good morning, Sam</p>
              </div>
              <div className="hidden items-center gap-4 text-right sm:flex">
                <Stat label="Streak" value="12 days" />
                <Stat label="Accuracy" value="78%" />
                <Stat label="To revise" value="9" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1.35fr]">
              {/* Left column */}
              <div className="flex flex-col gap-3">
                <Panel title="Today's plan" meta="1 of 3 done">
                  <ul className="divide-y divide-line">
                    {plan.map((p) => (
                      <li key={p.topic} className="flex items-center gap-2.5 py-2 text-[12.5px]">
                        {p.done ? (
                          <CheckCircle2 className="size-4 text-mark-green" />
                        ) : (
                          <Circle className="size-4 text-line-strong" />
                        )}
                        <span className={cn("flex-1", p.done && "text-muted line-through")}>
                          <span className="font-medium">{p.subject}</span>
                          <span className="text-muted"> · </span>
                          {p.topic}
                        </span>
                        <span className="font-mono text-[11px] text-muted">{p.mins}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Upcoming" meta="this week">
                  <ul className="flex flex-col gap-2">
                    {deadlines.map((d) => (
                      <li key={d.title} className="flex items-center gap-2.5 text-[12.5px]">
                        <span className={cn("h-6 w-0.5 rounded-full", d.cat)} />
                        <span className="flex-1 truncate">{d.title}</span>
                        <span className="font-mono text-[11px] text-muted">{d.when}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Study hours" meta="7.25 h this week" className="hidden sm:block">
                  <div className="flex h-16 items-end gap-2">
                    {week.map((w, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={cn("w-full rounded-sm", w.h ? "bg-ink/80" : "h-0.5 bg-line-strong")}
                          style={w.h ? { height: `${(w.h / 3) * 48}px` } : undefined}
                        />
                        <span className="font-mono text-[9px] text-muted">{w.d}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              {/* Quiz card */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent" className="h-5 px-1.5 text-[11px]">
                      Short practice
                    </Badge>
                    <span className="text-[12px] text-muted">Go · Interfaces</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted">4 / 10</span>
                </div>
                <div className="h-0.5 bg-surface-3">
                  <div className="h-full w-[40%] bg-accent" />
                </div>
                <div className="px-3.5 pt-3">
                  <p className="text-[13px] font-medium">What does this program print?</p>
                </div>
                <StaticCode code={SAMPLE_GO} className="mx-3.5 mt-2.5 rounded-md border border-line text-[11.5px]" />
                <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-md bg-mark-green-soft px-3 py-2 text-[12px]">
                  <Check className="mt-px size-3.5 shrink-0 text-mark-green" />
                  <p>
                    <span className="font-semibold text-mark-green">Correct — prints 9.</span>{" "}
                    <span className="text-ink-2">Square satisfies Shape implicitly by implementing Area().</span>
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 px-3.5 py-3">
                  <span className="mr-1 text-[11.5px] text-muted">Mark:</span>
                  <MarkChip mark="GREEN" label="Understood" selected />
                  <MarkChip mark="YELLOW" label="Revise" />
                  <MarkChip mark="RED" label="Weak" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-wide text-muted uppercase">{label}</p>
      <p className="text-[13px] font-semibold">{value}</p>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface px-3.5 py-3", className)}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[12.5px] font-semibold">{title}</p>
        {meta && <p className="font-mono text-[10.5px] text-muted">{meta}</p>}
      </div>
      {children}
    </div>
  );
}

function MarkChip({
  mark,
  label,
  selected,
}: {
  mark: "GREEN" | "YELLOW" | "RED";
  label: string;
  selected?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11.5px]",
        selected ? "border-mark-green/40 bg-mark-green-soft font-medium text-mark-green" : "border-line text-ink-2",
      )}
    >
      <MarkDot mark={mark} />
      {label}
    </span>
  );
}
