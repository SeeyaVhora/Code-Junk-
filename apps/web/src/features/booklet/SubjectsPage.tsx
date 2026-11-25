import { useState } from "react";
import { Link } from "react-router";
import { FolderTree, Plus } from "lucide-react";
import { Button, EmptyState, QueryView } from "@/components/ui";
import { useSubjects } from "@/features/subjects/api";
import { SubjectDialog } from "@/features/subjects/components";
import { languageLabel } from "@code-junk/shared";

export default function SubjectsPage() {
  const q = useSubjects();
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" leftIcon={<Plus />} onClick={() => setCreating(true)}>New subject</Button>
      </div>
      <QueryView query={q}>
        {(subjects) =>
          subjects.length === 0 ? (
            <EmptyState icon={<FolderTree />} title="No subjects yet" description="Create subjects like Go, Python or Mathematics, then add topics inside them." action={<Button leftIcon={<Plus />} onClick={() => setCreating(true)}>Create your first subject</Button>} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <li key={s.id}>
                  <Link to={`/app/booklet/subjects/${s.id}`} className="block h-full rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold tracking-tight">{s.name}</p>
                      {s.isCoding && s.defaultLang && <span className="font-mono text-[11px] text-muted">{languageLabel(s.defaultLang)}</span>}
                    </div>
                    {s.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{s.description}</p>}
                    <p className="mt-3 text-xs text-muted">
                      {s.topics.length} topic{s.topics.length === 1 ? "" : "s"} · {s._count.snippets} snippet{s._count.snippets === 1 ? "" : "s"} · {s._count.questions} question{s._count.questions === 1 ? "" : "s"}
                    </p>
                    {s.topics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {s.topics.slice(0, 6).map((t) => <span key={t.id} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">{t.name}</span>)}
                        {s.topics.length > 6 && <span className="text-[11px] text-muted">+{s.topics.length - 6}</span>}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      {creating && <SubjectDialog open onClose={() => setCreating(false)} />}
    </div>
  );
}
