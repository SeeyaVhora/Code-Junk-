import { CheckCircle2, FolderTree, Sparkles } from "lucide-react";
import { Container, MarkDot, SectionHeading } from "@/components/ui";

const steps = [
  {
    n: "01",
    title: "Organise your learning",
    description:
      "Create subjects like Go, Python or Mathematics. Save your code, add exams and assignments, and plan study sessions.",
    visual: (
      <ul className="space-y-1.5 font-mono text-[12px] text-ink-2">
        <li className="flex items-center gap-2">
          <FolderTree className="size-3.5 text-muted" aria-hidden /> Go
        </li>
        <li className="pl-5">├─ pointers.go</li>
        <li className="pl-5">├─ structs.go</li>
        <li className="pl-5 text-ink">└─ interfaces.go</li>
      </ul>
    ),
  },
  {
    n: "02",
    title: "Practise with AI-generated questions",
    description:
      "Pick topics, difficulty and question types. Answer one question at a time, with checked answers and explanations.",
    visual: (
      <div className="space-y-2 text-[12px]">
        <div className="flex items-center gap-2 text-ink-2">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          10 questions · Interfaces, Structs · Intermediate
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-3/5 rounded-full bg-accent" />
        </div>
      </div>
    ),
  },
  {
    n: "03",
    title: "Track progress and improve",
    description:
      "Mark what you understand. Weak questions return in your weekly revision until your accuracy shows you've got them.",
    visual: (
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <MarkDot mark="GREEN" /> 24 understood
        </span>
        <span className="flex items-center gap-1.5">
          <MarkDot mark="YELLOW" /> 7 to revise
        </span>
        <span className="flex items-center gap-1.5">
          <MarkDot mark="RED" /> 2 weak
        </span>
        <span className="flex items-center gap-1.5 text-mark-green">
          <CheckCircle2 className="size-3.5" aria-hidden /> +12% this week
        </span>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="border-t border-line py-20 sm:py-28">
      <Container>
        <SectionHeading id="how-title" eyebrow="how it works" title="Three steps, repeated every week." />
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s) => (
            <li key={s.n} className="relative flex flex-col">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-accent">{s.n}</span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.description}</p>
              <div aria-hidden className="mt-6 rounded-lg border border-line bg-surface p-4">
                {s.visual}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
