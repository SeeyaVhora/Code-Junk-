import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, ListChecks, Play, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, type QuestionType } from "@code-junk/shared";
import { Badge, Button, ButtonLink, EmptyState, MarkDot, PageHeader, QueryView, Section, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtDuration, relative } from "@/lib/format";
import { PracticeTabs } from "./GeneratePage";

interface QuizRow {
  id: string;
  title: string;
  mode: string;
  isSaved: boolean;
  createdAt: string;
  subject: { name: string };
  _count: { questions: number };
  attempts: { id: string; status: string; startedAt: string; correctCount: number; partialCount: number; incorrectCount: number }[];
}

const modeLabel = (m: string) => (m === "LONG" ? "Long" : m === "REVISION" ? "Revision" : "Short");

export function QuizzesPage() {
  const q = useQuery({ queryKey: ["quizzes"], queryFn: async () => (await api<{ quizzes: QuizRow[] }>("/quizzes")).quizzes });
  return (
    <div>
      <PageHeader title="AI Practice" />
      <PracticeTabs />
      <QueryView query={q}>
        {(quizzes) =>
          quizzes.length === 0 ? (
            <EmptyState icon={<ListChecks />} title="No quizzes yet" description="Generate your first set of questions to start practising." action={<ButtonLink to="/app/practice" leftIcon={<Sparkles />}>Generate questions</ButtonLink>} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {quizzes.map((z) => {
                const last = z.attempts[0];
                const open = z.attempts.find((x) => x.status === "IN_PROGRESS");
                return (
                  <li key={z.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <Link to={`/app/practice/quizzes/${z.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:underline">{z.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{modeLabel(z.mode)} · {z._count.questions} questions · {z.subject.name} · {relative(z.createdAt)}{z.isSaved ? " · saved" : ""}</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      {last && last.status !== "IN_PROGRESS" && <Badge tone="outline">{last.correctCount}/{z._count.questions} correct</Badge>}
                      {open ? <ButtonLink size="sm" to={`/app/practice/attempts/${open.id}`} leftIcon={<Play />}>Resume</ButtonLink> : <ButtonLink size="sm" variant="secondary" to={`/app/practice/quizzes/${z.id}`}>Open</ButtonLink>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

interface QuizDetail {
  id: string;
  title: string;
  mode: string;
  isSaved: boolean;
  createdAt: string;
  subject: { id: string; name: string };
  questions: { question: { id: string; title: string; type: string; difficulty: string; inLibrary: boolean; colorMark: "GREEN" | "YELLOW" | "RED" | null } }[];
  attempts: { id: string; status: string; startedAt: string; durationSecs: number | null; correctCount: number; partialCount: number; incorrectCount: number }[];
}

export function QuizDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["quizzes", id], queryFn: async () => (await api<{ quiz: QuizDetail }>(`/quizzes/${id}`)).quiz });
  const start = useMutation({ mutationFn: () => api<{ attemptId: string }>(`/quizzes/${id}/attempts`, { method: "POST" }), onSuccess: (r) => navigate(`/app/practice/attempts/${r.attemptId}`), onError: toast.error });
  const save = useMutation({ mutationFn: () => api(`/quizzes/${id}/save`, { method: "POST" }), onSuccess: () => { toast.success("Quiz saved to your library."); void qc.invalidateQueries({ queryKey: ["quizzes"] }); }, onError: toast.error });
  const del = useMutation({ mutationFn: () => api(`/quizzes/${id}`, { method: "DELETE" }), onSuccess: () => { qc.removeQueries({ queryKey: ["quizzes", id] }); void qc.invalidateQueries({ queryKey: ["quizzes"], exact: true }); toast.success("Quiz deleted."); navigate("/app/practice/quizzes"); }, onError: toast.error });

  return (
    <QueryView query={q}>
      {(z) => {
        const open = z.attempts.find((x) => x.status === "IN_PROGRESS");
        return (
          <div>
            <PageHeader
              eyebrow={`${modeLabel(z.mode)} practice · ${z.subject.name}`}
              title={z.title}
              actions={
                <>
                  <Button variant="secondary" leftIcon={<Save />} disabled={z.isSaved} loading={save.isPending} onClick={() => save.mutate()}>{z.isSaved ? "Saved" : "Save quiz"}</Button>
                  <Button leftIcon={open ? <Play /> : <RotateCcw />} loading={start.isPending} onClick={() => start.mutate()}>{open ? "Resume" : z.attempts.length ? "Reattempt" : "Start"}</Button>
                  <Button variant="ghost" size="icon" aria-label="Delete quiz" onClick={async () => { if (await confirm({ title: "Delete this quiz?", body: "Its attempts are deleted. Questions saved in your library are kept.", danger: true, confirmLabel: "Delete" })) del.mutate(); }}><Trash2 /></Button>
                </>
              }
            />
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <Section title={`Questions (${z.questions.length})`}>
                <ol className="divide-y divide-line">
                  {z.questions.map(({ question: x }, i) => (
                    <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                      <Link to={`/app/library/questions/${x.id}`} className="flex-1 truncate hover:underline">{x.title}</Link>
                      {x.colorMark && <MarkDot mark={x.colorMark} />}
                      <span className="hidden text-xs text-muted sm:inline">{QUESTION_TYPE_LABEL[x.type as QuestionType]} · {DIFFICULTY_LABEL[x.difficulty as keyof typeof DIFFICULTY_LABEL]}</span>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section title="Attempts">
                {z.attempts.length === 0 ? <p className="text-sm text-muted">Not attempted yet.</p> : (
                  <ul className="space-y-2">
                    {z.attempts.map((t) => (
                      <li key={t.id}><Link to={`/app/practice/attempts/${t.id}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm hover:border-line-strong">
                        <span>{fmtDateTime(t.startedAt)}</span>
                        <span className="text-xs text-muted">{t.status === "IN_PROGRESS" ? "in progress" : `${t.correctCount} correct · ${t.partialCount} partial · ${fmtDuration(t.durationSecs ?? 0)}`}</span>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

interface HistoryRow { id: string; status: string; startedAt: string; durationSecs: number | null; correctCount: number; partialCount: number; incorrectCount: number; quiz: { id: string; title: string; mode: string; subject: { name: string }; _count: { questions: number } } }

export function HistoryPage() {
  const q = useQuery({ queryKey: ["attempts"], queryFn: async () => (await api<{ attempts: HistoryRow[] }>("/attempts")).attempts });
  return (
    <div>
      <PageHeader title="AI Practice" />
      <PracticeTabs />
      <QueryView query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon={<History />} title="No practice yet" description="Every quiz attempt is kept here, so you can see how you've improved." action={<ButtonLink to="/app/practice" leftIcon={<Sparkles />}>Start practising</ButtonLink>} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Quiz</th><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Result</th><th className="px-4 py-2 font-medium">Time</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-2.5"><Link to={`/app/practice/attempts/${r.id}`} className="font-medium hover:underline">{r.quiz.title}</Link><p className="text-xs text-muted">{modeLabel(r.quiz.mode)} · {r.quiz.subject.name}</p></td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{fmtDateTime(r.startedAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{r.status === "IN_PROGRESS" ? <Badge tone="accent">in progress</Badge> : `${r.correctCount}/${r.quiz._count.questions} correct${r.partialCount ? `, ${r.partialCount} partial` : ""}`}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{r.durationSecs ? fmtDuration(r.durationSecs) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
