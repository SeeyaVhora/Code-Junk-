import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, ChevronRight, Flag, Library, RotateCcw, Save } from "lucide-react";
import { CODE_ANSWER_TYPES, DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, type ColorMark, type QuestionType } from "@code-junk/shared";
import { Badge, Button, QueryView, Section, StatTile, Textarea, errorMessage, useConfirm, useToast } from "@/components/ui";
import { CodeEditor } from "@/components/code/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDuration } from "@/lib/format";
import { MarkPicker } from "@/features/questions/MarkPicker";
import { useQuestionMutations, type Submission } from "@/features/questions/api";
import { AnswerFeedback, type RevealedQuestion } from "./AnswerFeedback";

interface PlayerQuestion extends RevealedQuestion {
  title: string;
  body: string;
  difficulty: string;
  language: string | null;
  starterCode: string | null;
  inLibrary: boolean;
  isBookmarked: boolean;
  personalNotes: string | null;
  topic: { id: string; name: string } | null;
  submission: Submission | null;
}
interface Summary {
  total: number;
  answered: number;
  correct: number;
  partial: number;
  incorrect: number;
  ungraded: number;
  accuracy: number | null;
  byTopic: { topic: string; correct: number; partial: number; incorrect: number; total: number }[];
  toRevise: { id: string; title: string }[];
}
interface AttemptView {
  attempt: {
    id: string;
    status: string;
    currentIndex: number;
    startedAt: string;
    durationSecs: number | null;
    quiz: { id: string; title: string; mode: string; subject: { name: string }; isSaved: boolean };
    questions: PlayerQuestion[];
  };
  summary: Summary | null;
}

export default function QuizPlayerPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["attempt", id], queryFn: () => api<AttemptView>(`/attempts/${id}`) });
  return <QueryView query={q}>{(d) => (d.attempt.status === "IN_PROGRESS" ? <Player data={d} /> : <Results data={d} />)}</QueryView>;
}

function Player({ data }: { data: AttemptView }) {
  const a = data.attempt;
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const qm = useQuestionMutations();
  const [index, setIndex] = useState(Math.min(a.currentIndex, a.questions.length - 1));
  const [answers, setAnswers] = useState<Record<string, { text: string; options: string[] }>>({});
  const shownAt = useRef(Date.now());
  const q = a.questions[index]!;
  const isCode = CODE_ANSWER_TYPES.includes(q.type as QuestionType);
  const draft = answers[q.id] ?? { text: q.starterCode ?? "", options: [] };
  const setDraft = (d: Partial<typeof draft>) => setAnswers((x) => ({ ...x, [q.id]: { ...draft, ...d } }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["attempt", a.id] });

  useEffect(() => {
    shownAt.current = Date.now();
    void api(`/attempts/${a.id}/position`, { method: "PATCH", body: { index } }).catch(() => {});
  }, [index, a.id]);

  const submit = useMutation({
    mutationFn: () => api(`/attempts/${a.id}/answers`, { method: "POST", body: { questionId: q.id, answerText: q.type === "MCQ" ? undefined : draft.text, selectedOptionIds: q.type === "MCQ" ? draft.options : [], timeSpentSecs: Math.round((Date.now() - shownAt.current) / 1000) } }),
    onSuccess: refresh,
    onError: toast.error,
  });
  const selfGrade = useMutation({ mutationFn: (verdict: string) => api(`/attempts/${a.id}/submissions/${q.submission!.id}/self-grade`, { method: "POST", body: { verdict } }), onSuccess: refresh, onError: toast.error });
  const finish = useMutation({ mutationFn: () => api(`/attempts/${a.id}/finish`, { method: "POST" }), onSuccess: () => { void refresh(); void qc.invalidateQueries({ queryKey: ["dashboard"] }); }, onError: toast.error });

  const answered = a.questions.filter((x) => x.submission).length;
  const canSubmit = q.type === "MCQ" ? draft.options.length > 0 : draft.text.trim().length > 0;
  const multi = (q.correctOptionIds?.length ?? 0) > 1;

  const doFinish = async () => {
    const left = a.questions.length - answered;
    if (left > 0 && !(await confirm({ title: "Finish now?", body: `${left} question${left === 1 ? " is" : "s are"} unanswered and won't count.`, confirmLabel: "Finish quiz" }))) return;
    finish.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{a.quiz.title}</p>
          <p className="text-xs text-muted">{a.quiz.mode === "LONG" ? "Long mode" : a.quiz.mode === "REVISION" ? "Revision" : "Short mode"} · {answered} of {a.questions.length} answered</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Flag />} loading={finish.isPending} onClick={() => void doFinish()}>Finish</Button>
      </div>
      <div className="mb-5 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={a.questions.length} aria-valuenow={answered} aria-label="Quiz progress">
        {a.questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            aria-label={`Question ${i + 1}${x.submission ? `, answered ${x.submission.verdict.toLowerCase()}` : ""}`}
            onClick={() => setIndex(i)}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", i === index && "ring-2 ring-accent ring-offset-2 ring-offset-paper", x.submission ? (x.submission.verdict === "CORRECT" ? "bg-mark-green" : x.submission.verdict === "PARTIAL" ? "bg-mark-yellow" : x.submission.verdict === "INCORRECT" ? "bg-mark-red" : "bg-ink-2") : "bg-surface-3")}
          />
        ))}
      </div>

      <article className="rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <p className="font-mono text-sm">Question {index + 1} <span className="text-muted">/ {a.questions.length}</span></p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="outline">{QUESTION_TYPE_LABEL[q.type as QuestionType]}</Badge>
            <Badge>{DIFFICULTY_LABEL[q.difficulty as keyof typeof DIFFICULTY_LABEL]}</Badge>
            {q.topic && <Badge tone="accent">{q.topic.name}</Badge>}
          </div>
        </header>
        <div className="space-y-5 px-5 py-5">
          <div>
            <h2 className="mb-2 text-lg font-semibold tracking-tight">{q.title}</h2>
            <Markdown text={q.body} />
          </div>

          {q.type === "MCQ" ? (
            <fieldset disabled={!!q.submission} className="space-y-2">
              <legend className="sr-only">Choose {multi ? "all correct options" : "an option"}</legend>
              {q.options?.map((o) => {
                const chosen = (q.submission?.selectedOptionIds ?? draft.options).includes(o.id);
                const correct = q.submission && q.correctOptionIds?.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                      // One state class only, so border colours never conflict.
                      q.submission
                        ? correct
                          ? "border-mark-green bg-mark-green-soft"
                          : chosen
                            ? "border-mark-red bg-mark-red-soft"
                            : "border-line opacity-70"
                        : chosen
                          ? "border-accent bg-accent-soft/50"
                          : "border-line hover:border-line-strong",
                    )}
                  >
                    <input type={multi ? "checkbox" : "radio"} name={`q-${q.id}`} className="mt-0.5 accent-[var(--accent)]" checked={chosen} onChange={() => setDraft({ options: multi ? (chosen ? draft.options.filter((x) => x !== o.id) : [...draft.options, o.id]) : [o.id] })} />
                    <span className="font-mono font-medium">{o.id}</span>
                    <span>{o.text}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : q.submission ? (
            <div><p className="mb-1 text-xs font-medium text-muted uppercase">Your answer</p>{isCode ? <CodeEditor value={q.submission.answerText ?? ""} language={q.language} readOnly minHeight="80px" /> : <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm whitespace-pre-wrap">{q.submission.answerText}</p>}</div>
          ) : isCode ? (
            <CodeEditor value={draft.text} onChange={(v) => setDraft({ text: v })} language={q.language} minHeight={a.quiz.mode === "LONG" ? "280px" : "160px"} ariaLabel="Your answer" />
          ) : (
            <Textarea aria-label="Your answer" value={draft.text} onChange={(e) => setDraft({ text: e.target.value })} placeholder={q.type === "OUTPUT_PREDICTION" ? "Type the exact output…" : "Type your answer…"} className={cn("font-[inherit]", q.type === "OUTPUT_PREDICTION" && "font-mono text-[13px]", a.quiz.mode === "LONG" ? "min-h-48" : "min-h-28")} />
          )}

          {!q.submission ? (
            <div className="flex justify-end"><Button loading={submit.isPending} disabled={!canSubmit} onClick={() => submit.mutate()}>{submit.isPending ? "Checking…" : "Submit answer"}</Button></div>
          ) : (
            <>
              <AnswerFeedback q={q} s={q.submission} onSelfGrade={(v) => selfGrade.mutate(v)} grading={selfGrade.isPending} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <MarkPicker value={q.colorMark} suggested={q.submission.suggestedMark} onChange={(m: ColorMark | null) => qm.mark.mutate({ id: q.id, colorMark: m }, { onSuccess: refresh })} />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<Library />} disabled={q.inLibrary} onClick={() => qm.update.mutate({ id: q.id, inLibrary: true }, { onSuccess: () => { void refresh(); toast.success("Saved to your library."); } })}>{q.inLibrary ? "In library" : "Save question"}</Button>
                  <Button size="icon-sm" variant="secondary" aria-label={q.isBookmarked ? "Remove bookmark" : "Bookmark"} aria-pressed={q.isBookmarked} onClick={() => qm.update.mutate({ id: q.id, isBookmarked: !q.isBookmarked, inLibrary: true }, { onSuccess: refresh })}><Bookmark className={cn(q.isBookmarked && "fill-accent text-accent")} /></Button>
                </div>
              </div>
            </>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-5 py-3">
          <Button variant="ghost" size="sm" leftIcon={<ChevronLeft />} disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
          {index < a.questions.length - 1 ? (
            <Button size="sm" variant={q.submission ? "primary" : "secondary"} rightIcon={<ChevronRight />} onClick={() => setIndex(index + 1)}>{q.submission ? "Next" : "Skip"}</Button>
          ) : (
            <Button size="sm" leftIcon={<Flag />} loading={finish.isPending} onClick={() => void doFinish()}>See results</Button>
          )}
        </footer>
      </article>
      {submit.isError && <p className="mt-3 text-sm text-danger">{errorMessage(submit.error)}</p>}
    </div>
  );
}

function Results({ data }: { data: AttemptView }) {
  const a = data.attempt;
  const s = data.summary!;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const qm = useQuestionMutations();
  const save = useMutation({ mutationFn: () => api(`/quizzes/${a.quiz.id}/save`, { method: "POST" }), onSuccess: () => { toast.success("Quiz saved. All its questions are in your library."); void qc.invalidateQueries({ queryKey: ["attempt", a.id] }); }, onError: toast.error });
  const retake = useMutation({ mutationFn: () => api<{ attemptId: string }>(`/quizzes/${a.quiz.id}/attempts`, { method: "POST" }), onSuccess: (r) => navigate(`/app/practice/attempts/${r.attemptId}`), onError: toast.error });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs text-muted">results</p>
          <h1 className="text-2xl font-semibold tracking-tight">{a.quiz.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<Save />} disabled={a.quiz.isSaved} loading={save.isPending} onClick={() => save.mutate()}>{a.quiz.isSaved ? "Saved" : "Save quiz"}</Button>
          <Button leftIcon={<RotateCcw />} loading={retake.isPending} onClick={() => retake.mutate()}>Reattempt</Button>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Questions" value={s.total} />
        <StatTile label="Correct" value={s.correct} />
        <StatTile label="Partial" value={s.partial} />
        <StatTile label="Incorrect" value={s.incorrect} hint={s.total - s.answered ? `${s.total - s.answered} unanswered` : undefined} />
        <StatTile label="Accuracy" value={s.accuracy === null ? "–" : `${s.accuracy}%`} />
        <StatTile label="Time" value={fmtDuration(a.durationSecs ?? 0)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Section title="By topic">
            <ul className="space-y-3">
              {s.byTopic.map((t) => {
                const p = t.total ? Math.round(((t.correct + t.partial * 0.5) / t.total) * 100) : 0;
                return (
                  <li key={t.topic}>
                    <div className="flex justify-between text-sm"><span>{t.topic}</span><span className="font-mono text-xs text-muted">{t.correct}/{t.total}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={cn("h-full rounded-full", p >= 75 ? "bg-mark-green" : p >= 40 ? "bg-mark-yellow" : "bg-mark-red")} style={{ width: `${p}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Needs revision">
            {s.toRevise.length === 0 ? <p className="text-sm text-muted">Nothing to revise from this quiz. 🎉</p> : (
              <>
                <p className="mb-2 text-xs text-muted">These are in your revision queue.</p>
                <ul className="space-y-1.5">{s.toRevise.map((q) => <li key={q.id}><Link to={`/app/library/questions/${q.id}`} className="text-sm hover:underline">{q.title}</Link></li>)}</ul>
              </>
            )}
          </Section>
        </div>
        <Section title="Answer review">
          <ol className="divide-y divide-line">
            {a.questions.map((q, i) => (
              <li key={q.id} className="py-3">
                <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <span className="w-6 font-mono text-xs text-muted">{i + 1}</span>
                  <span className="flex-1 truncate text-sm font-medium">{q.title}</span>
                  <Badge tone={q.submission?.verdict === "CORRECT" ? "green" : q.submission?.verdict === "PARTIAL" ? "yellow" : q.submission?.verdict === "INCORRECT" ? "red" : "neutral"}>{q.submission ? (q.submission.verdict === "UNGRADED" ? "ungraded" : q.submission.verdict.toLowerCase()) : "skipped"}</Badge>
                </button>
                {open === q.id && (
                  <div className="mt-3 space-y-4 pl-9">
                    <Markdown text={q.body} />
                    {q.submission ? <AnswerFeedback q={q} s={q.submission} /> : <AnswerFeedback q={q} s={{ id: "", verdict: "INCORRECT", gradingMethod: null, score: null, maxScore: null, answerText: null, selectedOptionIds: [], feedback: "Not answered.", mistakes: null, criteriaResults: null, suggestedMark: null, submittedAt: "" }} />}
                    <MarkPicker value={q.colorMark} suggested={q.submission?.suggestedMark} onChange={(m) => qm.mark.mutate({ id: q.id, colorMark: m }, { onSuccess: () => void qc.invalidateQueries({ queryKey: ["attempt", a.id] }) })} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
