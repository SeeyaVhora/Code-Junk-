import { useState, type ReactNode } from "react";
import { Inbox, Plus, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  ErrorState,
  Eyebrow,
  Field,
  Input,
  Kbd,
  MarkBadge,
  Skeleton,
  Spinner,
  Textarea,
  ThemeToggle,
} from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { StaticCode } from "@/components/code/StaticCode";

/** Living reference for the design system. Only routed in development builds. */
const swatches: { name: string; cls: string }[] = [
  { name: "paper", cls: "bg-paper" },
  { name: "surface", cls: "bg-surface" },
  { name: "surface-2", cls: "bg-surface-2" },
  { name: "surface-3", cls: "bg-surface-3" },
  { name: "line", cls: "bg-line" },
  { name: "ink", cls: "bg-ink" },
  { name: "ink-2", cls: "bg-ink-2" },
  { name: "muted", cls: "bg-muted" },
  { name: "accent", cls: "bg-accent" },
  { name: "accent-soft", cls: "bg-accent-soft" },
  { name: "mark-green", cls: "bg-mark-green" },
  { name: "mark-yellow", cls: "bg-mark-yellow" },
  { name: "mark-red", cls: "bg-mark-red" },
  { name: "cat-exam", cls: "bg-cat-exam" },
  { name: "cat-assignment", cls: "bg-cat-assignment" },
  { name: "cat-college", cls: "bg-cat-college" },
  { name: "cat-deadline", cls: "bg-cat-deadline" },
  { name: "cat-personal", cls: "bg-cat-personal" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <Eyebrow className="mb-5">{title}</Eyebrow>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const titleError = title.length > 0 && title.trim().length < 3 ? "Title must be at least 3 characters." : undefined;

  return (
    <Container className="py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Design system</h1>
      <p className="mt-2 text-ink-2">Tokens and components used across Code Junk.</p>

      <Section title="colour tokens">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {swatches.map((s) => (
            <div key={s.name}>
              <div className={`h-14 rounded-md border border-line ${s.cls}`} />
              <p className="mt-1.5 font-mono text-[11px] text-muted">{s.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="typography">
        <div className="space-y-3">
          <p className="text-5xl font-semibold tracking-[-0.035em]">Display 48</p>
          <p className="text-3xl font-semibold tracking-tight">Heading 30</p>
          <p className="text-lg font-semibold">Title 18</p>
          <p className="text-[15px] text-ink-2">Body 15. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-sm text-muted">Caption 14, muted</p>
          <p className="font-mono text-sm">Mono 14: func main() {"{}"}</p>
        </div>
      </Section>

      <Section title="buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="accent" leftIcon={<Sparkles />}>
            Generate
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
            {loading ? "Saving…" : "Click to load"}
          </Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="secondary" aria-label="Add">
            <Plus />
          </Button>
        </div>
      </Section>

      <Section title="badges & marks">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Go</Badge>
          <Badge tone="outline">Intermediate</Badge>
          <MarkBadge mark="GREEN" />
          <MarkBadge mark="YELLOW" />
          <MarkBadge mark="RED" />
        </div>
      </Section>

      <Section title="forms">
        <div className="grid max-w-md gap-4">
          <Field label="Snippet title" error={titleError} hint="Shown in the booklet's table of contents.">
            {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Interfaces in Go" />}
          </Field>
          <Field label="Notes">{(a) => <Textarea {...a} placeholder="Anything you want to remember…" />}</Field>
        </div>
      </Section>

      <Section title="cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Today's plan</CardTitle>
                <CardDescription>3 sessions · 2 h 15 min</CardDescription>
              </div>
              <Badge tone="accent">Today</Badge>
            </CardHeader>
            <CardContent className="text-sm text-ink-2">Card body content.</CardContent>
            <CardFooter>
              <Button size="sm" variant="secondary">View planner</Button>
            </CardFooter>
          </Card>
          <Card interactive>
            <CardContent>
              <p className="text-sm font-medium">Interactive card</p>
              <p className="mt-1 text-sm text-muted">Hover to see the border and shadow change.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="code">
        <StaticCode
          className="rounded-lg border border-line"
          highlightLines={[2]}
          code={`func Sum(nums []int) int {\n    total := 0 // running sum\n    for _, n := range nums {\n        total += n\n    }\n    return total\n}`}
        />
      </Section>

      <Section title="states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={<Inbox />}
            title="No snippets yet"
            description="Save your first piece of code to start your booklet."
            action={<Button size="sm" leftIcon={<Plus />}>New snippet</Button>}
          />
          <div className="space-y-4">
            <ErrorState description="We couldn't load your questions." onRetry={() => {}} />
            <div className="space-y-2 rounded-lg border border-line p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <Spinner label="Generating questions…" />
            <p className="text-sm text-ink-2">
              Shortcut: <Kbd>⌘</Kbd> <Kbd>K</Kbd>
            </p>
          </div>
        </div>
      </Section>
    </Container>
  );
}
