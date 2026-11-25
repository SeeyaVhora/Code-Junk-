import { ArrowRight } from "lucide-react";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

/** "About": the product principle, shown as the connections between modules. */
const connections = [
  { when: "You get a question wrong", then: "It joins your revision queue with your answer and the explanation." },
  { when: "You mark a question red", then: "It's prioritised in your next weekly revision session." },
  { when: "You schedule a study session", then: "It appears on your calendar and in today's plan." },
  { when: "You add an examination", then: "It shows on your dashboard with a countdown." },
  { when: "You finish a quiz", then: "Your topic accuracy and weekly analytics update." },
  { when: "You save a generated question", then: "It's in your library, searchable by topic and colour." },
];

export function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="border-t border-line bg-surface/50 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
        <div>
          <SectionHeading
            id="about-title"
            eyebrow="about"
            title="Code Junk remembers, so you can focus on learning."
            description="Most students keep code in one place, questions in another and deadlines somewhere else. Code Junk connects them, so your notes, practice and schedule build on each other."
          />
          <ButtonLink to="/signup" variant="secondary" className="mt-8" rightIcon={<ArrowRight />}>
            Start your journal
          </ButtonLink>
        </div>

        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {connections.map((c) => (
            <li key={c.when} className="grid gap-1 px-5 py-4 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <p className="text-sm font-medium text-ink">{c.when}</p>
              <p className="flex gap-2 text-sm text-ink-2">
                <ArrowRight aria-hidden className="mt-0.5 hidden size-4 shrink-0 text-accent sm:block" />
                {c.then}
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
