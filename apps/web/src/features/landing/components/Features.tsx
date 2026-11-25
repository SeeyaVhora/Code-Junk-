import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Library,
  LineChart,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Container, SectionHeading } from "@/components/ui";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
}

const features: Feature[] = [
  {
    icon: BookOpen,
    title: "Code Booklet",
    description: "Store and organise your code snippets by subject and topic, then read them back like a book.",
    detail: "syntax highlighting · tags · PDF export",
  },
  {
    icon: Sparkles,
    title: "AI Question Generator",
    description: "Generate personalised practice questions for the exact topics and difficulty you choose.",
    detail: "short & long mode · OpenAI or Gemini",
  },
  {
    icon: RotateCcw,
    title: "Smart Revision",
    description: "Questions you get wrong come back automatically, spaced out until they stick.",
    detail: "weekly sessions · spaced repetition",
  },
  {
    icon: FileText,
    title: "Practice Papers",
    description: "Turn your syllabus and past papers into original, exam-style papers with marking.",
    detail: "timed exam mode · answer keys",
  },
  {
    icon: Library,
    title: "Question Library",
    description: "One home for questions from quizzes, sample papers, LeetCode links and your own notes.",
    detail: "green · yellow · red marking",
  },
  {
    icon: ClipboardList,
    title: "Learning Planner",
    description: "Set learning goals, schedule study sessions and compare planned time with actual time.",
    detail: "daily & weekly plans · reminders",
  },
  {
    icon: CalendarDays,
    title: "Academic Calendar",
    description: "Exams, assignments, college events and deadlines alongside your study sessions.",
    detail: "month · week · day · agenda",
  },
  {
    icon: LineChart,
    title: "Progress Analytics",
    description: "See accuracy by topic, study time and the concepts that need attention, from real activity.",
    detail: "weakness analysis · trends",
  },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="border-t border-line bg-surface/50 py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="features-title"
          eyebrow="features"
          title="A journal, a tutor and a planner that talk to each other."
          description="Eight tools built around one idea: everything you study should be easy to find, practise and revisit."
        />
        <ul className="mt-14 grid overflow-hidden rounded-xl border border-line bg-line [gap:1px] sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <li key={f.title} className="group flex flex-col bg-surface p-6 transition-colors duration-150 hover:bg-paper">
              <div className="flex size-9 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors group-hover:border-accent/40 group-hover:text-accent">
                <f.icon className="size-[18px]" aria-hidden />
              </div>
              <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{f.description}</p>
              <p className="mt-5 font-mono text-[11px] text-muted">{f.detail}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
