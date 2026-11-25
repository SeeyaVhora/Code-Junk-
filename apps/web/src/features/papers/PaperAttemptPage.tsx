import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Flag, Send } from "lucide-react";
import { CODE_ANSWER_TYPES, type QuestionType } from "@code-junk/shared";
import { Badge, Button, QueryView, Section, StatTile, Textarea, useConfirm, useToast } from "@/components/ui";
import { CodeEditor } from "@/components/code/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDuration } from "@/lib/format";
import type { Submission } from "@/features/questions/api";
import { AnswerFeedback } from "@/features/practice/AnswerFeedback";

interface PQ {
  id: string;
  sectionId: string | null;
  marks: number;
  questionId: string;
  question: { id: string; title: string; body: string; type: string; language: string | null; options: { id: string; text: string }[] | null; correctOptionIds?: string[]; expectedAnswer?: string | null; solution?: string | null; explanation?: string | null; concepts?: string[]; colorMark: null; topic: { name: string } | null };
}
interface Results { scored: number; max: number; pct: number; perQuestion: { paperQuestionId: string; questionId: string; marks: number; scored: number; verdict: string | null; attempted: boolean }[]; byTopic: { topic: string; scored: number; max: number; pct: number }[]; weakAreas: string[]; ungraded: number }
interface View {
  attempt: { id: string; mode: "EXAM" | "GUIDED"; feedbackTiming: "END" | "IMMEDIATE"; status: string; deadlineAt: string | null; startedAt: string; draftAnswers: { answers?: Record<string, { text?: string; options?: string[] }>; flagged?: string[] } | null; submissions: (Submission & { questionId: string })[] };
  paper: { id: string; title: string; totalMarks: number; durationMins: number; sections: { id: string; title: string }[]; questions: PQ[] };
  results: Results | null;
}

export default function PaperAttemptPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["paper-attempt", id], queryFn: () => api<View>(`/paper-attempts/${id}`) });
  return <QueryView query={q}>{(v) => (v.attempt.status === "IN_PROGRESS" ? <Solver v={v} /> : <ResultsView v={v} />)}</QueryView>;
}

function Solver({ v }: { v: View }) {
  const { attempt: a, paper } = v;
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { text?: string; options?: string[] }>>(a.draftAnswers?.answers ?? {});
  const [flagged, setFlagged] = useState<string[]>(a.draftAnswers?.flagged ?? []);
  const [visited, setVisited] = useState<Set<string>>(new Set([paper.questions[0]?.id ?? ""]));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);
  const pq = paper.questions[index]!;
  const q = pq.question;
  const sub = a.submissions.find((s) => s.questionId === pq.questionId);
  const ans = answers[pq.id] ?? {};
  const isCode = CODE_ANSWER_TYPES.includes(q.type as QuestionType);
  const immediate = a.feedbackTiming === "IMMEDIATE";
  const refresh = () => qc.invalidateQueries({ queryKey: ["paper-attempt", a.id] });

  const saveDraft = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    try {
      const r = await api<{ savedAt: string }>(`/paper-attempts/${a.id}/draft`, { method: "PUT", body: { answers, flagged } });
      setSavedAt(r.savedAt);
    } catch {
      dirty.current = true;
    }
  }, [a.id, answers, flagged]);

  useEffect(() => {
    const t = setInterval(() => void saveDraft(), 8000);
    return () => clearInterval(t);
  }, [saveDraft]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const submitPaper = useMutation({
    mutationFn: async () => {
      dirty.current = true;
      await saveDraft();
      return api(`/paper-attempts/${a.id}/submit`, { method: "POST" });
    },
    onSuccess: () => { toast.success("Paper submitted and evaluated."); void refresh(); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: toast.error,
  });
  const check = useMutation({
    mutationFn: () => api(`/paper-attempts/${a.id}/answers`, { method: "POST", body: { questionId: pq.questionId, answerText: q.type === "MCQ" ? undefined : ans.text, selectedOptionIds: q.type === "MCQ" ? (ans.options ?? []) : [] } }),
    onSuccess: refresh,
    onError: toast.error,
  });
  const selfGrade = useMutation({ mutationFn: (verdict: string) => api(`/paper-attempts/${a.id}/submissions/${sub!.id}/self-grade`, { method: "POST", body: { verdict } }), onSuccess: refresh, onError: toast.error });

  const remaining = a.deadlineAt ? Math.max(0, Math.round((new Date(a.deadlineAt).getTime() - now) / 1000)) : null;
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !autoSubmitted.current && !submitPaper.isPending) {
      autoSubmitted.current = true;
      toast.error("Time's up. Submitting your paper.");
      submitPaper.mutate();
    }
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAns = (patch: { text?: string; options?: string[] }) => {
    dirty.current = true;
    setAnswers((x) => ({ ...x, [pq.id]: { ...ans, ...patch } }));
  };
  const go = (i: number) => {
    void saveDraft();
    setIndex(i);
    setVisited((s) => new Set(s).add(paper.questions[i]!.id));
  };
  const status = (x: PQ) => {
    const has = !!(answers[x.id]?.text?.trim() || answers[x.id]?.options?.length || a.submissions.some((s) => s.questionId === x.questionId));
    if (flagged.includes(x.id)) return "review";
    if (has) return "answered";
    return visited.has(x.id) ? "attempted" : "not";
  };
  const counts = paper.questions.reduce((c, x) => ({ ...c, [status(x)]: (c[status(x) as keyof typeof c] ?? 0) + 1 }), { not: 0, attempted: 0, answered: 0, review: 0 } as Record<string, number>);
  const STATUS_CLS: Record<string, string> = { not: "border-line bg-surface text-ink-2", attempted: "border-mark-red/40 bg-mark-red-soft text-mark-red", answered: "border-mark-green/40 bg-mark-green-soft text-mark-green", review: "border-cat-college/40 bg-[color-mix(in_srgb,var(--cat-college)_15%,transparent)] text-cat-college" };

  const doSubmit = async () => {
    const unanswered = paper.questions.length - counts.answered! - counts.review!;
    if (await confirm({ title: "Submit the paper?", body: unanswered > 0 ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered and will score 0.` : "Your answers will be evaluated.", confirmLabel: "Submit paper" })) submitPaper.mutate();
  };

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-line bg-paper/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{paper.title}</p>
        {remaining !== null && <span className={cn("font-mono text-sm tabular-nums", remaining < 300 && "text-mark-red")} role="timer" aria-label="Time remaining">⏱ {fmtDuration(remaining)}</span>}
        <span className="text-xs text-muted">{savedAt ? "Saved" : "Autosaves"}</span>
        <Button size="sm" leftIcon={<Send />} loading={submitPaper.isPending} onClick={() => void doSubmit()}>{submitPaper.isPending ? "Evaluating…" : "Submit paper"}</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
        <article className="rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <p className="font-mono text-sm">Q{index + 1} <span className="text-muted">/ {paper.questions.length}</span></p>
            <div className="flex items-center gap-2"><Badge tone="outline">{pq.marks} marks</Badge>{a.mode === "EXAM" && <Button size="sm" variant={flagged.includes(pq.id) ? "secondary" : "ghost"} leftIcon={<Flag />} aria-pressed={flagged.includes(pq.id)} onClick={() => { dirty.current = true; setFlagged((f) => (f.includes(pq.id) ? f.filter((x) => x !== pq.id) : [...f, pq.id])); }}>{flagged.includes(pq.id) ? "Marked for review" : "Mark for review"}</Button>}</div>
          </header>
          <div className="space-y-5 px-5 py-5">
            <div><h2 className="mb-2 font-semibold">{q.title}</h2><Markdown text={q.body} /></div>
            {q.type === "MCQ" ? (
              <fieldset disabled={!!sub} className="space-y-2">
                <legend className="sr-only">Options</legend>
                {q.options?.map((o) => {
                  const chosen = (sub?.selectedOptionIds ?? ans.options ?? []).includes(o.id);
                  return <label key={o.id} className={cn("flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-sm", chosen ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-strong")}><input type="radio" name={`pq-${pq.id}`} className="accent-[var(--accent)]" checked={chosen} onChange={() => setAns({ options: [o.id] })} /><span className="font-mono font-medium">{o.id}</span><span>{o.text}</span></label>;
                })}
              </fieldset>
            ) : isCode ? (
              <CodeEditor value={sub?.answerText ?? ans.text ?? ""} onChange={sub ? undefined : (t) => setAns({ text: t })} readOnly={!!sub} language={q.language} minHeight="220px" ariaLabel="Your answer" />
            ) : (
              <Textarea aria-label="Your answer" readOnly={!!sub} value={sub?.answerText ?? ans.text ?? ""} onChange={(e) => setAns({ text: e.target.value })} className="min-h-40" placeholder="Write your answer…" />
            )}
            {immediate && !sub && <div className="flex justify-end"><Button loading={check.isPending} disabled={!(ans.text?.trim() || ans.options?.length)} onClick={() => check.mutate()}>{a.mode === "GUIDED" ? "Submit answer" : "Check answer"}</Button></div>}
            {sub && <AnswerFeedback q={q} s={sub} onSelfGrade={(vd) => selfGrade.mutate(vd)} grading={selfGrade.isPending} />}
          </div>
          <footer className="flex justify-between border-t border-line px-5 py-3">
            <Button size="sm" variant="ghost" leftIcon={<ChevronLeft />} disabled={index === 0} onClick={() => go(index - 1)}>Previous</Button>
            {index < paper.questions.length - 1 ? <Button size="sm" rightIcon={<ChevronRight />} onClick={() => go(index + 1)}>Next</Button> : <Button size="sm" leftIcon={<Send />} onClick={() => void doSubmit()}>Submit paper</Button>}
          </footer>
        </article>
        <aside className="space-y-4">
          <Section title="Questions">
            {paper.sections.map((s) => {
              const list = paper.questions.map((x, i) => ({ x, i })).filter(({ x }) => x.sectionId === s.id);
              return (
                <div key={s.id} className="mb-3">
                  <p className="mb-1.5 truncate text-[11px] text-muted">{s.title}</p>
                  <div className="grid grid-cols-5 gap-1.5">{list.map(({ x, i }) => <button key={x.id} type="button" onClick={() => go(i)} aria-label={`Question ${i + 1}, ${status(x)}`} aria-current={i === index} className={cn("h-8 rounded-md border text-xs font-medium", STATUS_CLS[status(x)], i === index && "ring-2 ring-ink ring-offset-1 ring-offset-surface")}>{i + 1}</button>)}</div>
                </div>
              );
            })}
            <ul className="mt-3 space-y-1 text-xs text-ink-2">
              <li className="flex items-center gap-2"><span className={cn("size-3 rounded border", STATUS_CLS.answered)} /> Answered ({counts.answered})</li>
              <li className="flex items-center gap-2"><span className={cn("size-3 rounded border", STATUS_CLS.review)} /> Marked for review ({counts.review})</li>
              <li className="flex items-center gap-2"><span className={cn("size-3 rounded border", STATUS_CLS.attempted)} /> Visited, not answered ({counts.attempted})</li>
              <li className="flex items-center gap-2"><span className={cn("size-3 rounded border", STATUS_CLS.not)} /> Not attempted ({counts.not})</li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function ResultsView({ v }: { v: View }) {
  const { attempt: a, paper } = v;
  const r = v.results!;
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const subs = new Map(a.submissions.map((s) => [s.questionId, s]));
  const selfGrade = useMutation({ mutationFn: ({ sid, verdict }: { sid: string; verdict: string }) => api(`/paper-attempts/${a.id}/submissions/${sid}/self-grade`, { method: "POST", body: { verdict } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-attempt", a.id] }), onError: toast.error });
  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-xs text-muted">results · {a.mode === "EXAM" ? "exam mode" : "guided practice"}</p><h1 className="text-2xl font-semibold tracking-tight">{paper.title}</h1></div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/papers/${paper.id}/pdf?variant=solved&attemptId=${a.id}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Download className="size-4" /> Solved paper PDF</a>
          <Link to={`/app/papers/${paper.id}`} className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-on-ink hover:bg-ink/85">Reattempt</Link>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Marks" value={`${r.scored} / ${r.max}`} />
        <StatTile label="Percentage" value={`${r.pct}%`} />
        <StatTile label="Attempted" value={`${r.perQuestion.filter((x) => x.attempted).length} / ${r.perQuestion.length}`} />
        <StatTile label="Self-grade pending" value={r.ungraded} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Section title="Topic performance">
            <ul className="space-y-3">{r.byTopic.map((t) => <li key={t.topic}><div className="flex justify-between text-sm"><span>{t.topic}</span><span className="font-mono text-xs text-muted">{t.scored}/{t.max}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={cn("h-full rounded-full", t.pct >= 75 ? "bg-mark-green" : t.pct >= 50 ? "bg-mark-yellow" : "bg-mark-red")} style={{ width: `${t.pct}%` }} /></div></li>)}</ul>
          </Section>
          <Section title="Areas to improve">
            {r.weakAreas.length ? <><ul className="list-disc space-y-1 pl-5 text-sm">{r.weakAreas.map((w) => <li key={w}>{w}</li>)}</ul><p className="mt-2 text-xs text-muted">Questions you got wrong here are already in your revision queue.</p></> : <p className="text-sm text-muted">No topic below 50%. Well done.</p>}
          </Section>
        </div>
        <Section title="Question-wise evaluation">
          <ol className="divide-y divide-line">
            {paper.questions.map((pq, i) => {
              const row = r.perQuestion.find((x) => x.paperQuestionId === pq.id)!;
              const s = subs.get(pq.questionId);
              return (
                <li key={pq.id} className="py-3">
                  <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open === pq.id} onClick={() => setOpen(open === pq.id ? null : pq.id)}>
                    <span className="w-7 font-mono text-xs text-muted">Q{i + 1}</span>
                    <span className="flex-1 truncate text-sm">{pq.question.title}</span>
                    <span className="font-mono text-xs">{row.scored}/{pq.marks}</span>
                    <Badge tone={row.verdict === "CORRECT" ? "green" : row.verdict === "PARTIAL" ? "yellow" : row.verdict === "INCORRECT" ? "red" : "neutral"}>{row.attempted ? (row.verdict === "UNGRADED" ? "ungraded" : row.verdict?.toLowerCase()) : "not attempted"}</Badge>
                  </button>
                  {open === pq.id && <div className="mt-3 space-y-3 pl-10"><Markdown text={pq.question.body} />{s ? <><p className="text-xs font-medium text-muted uppercase">Your answer</p><pre className="rounded-md border border-line bg-paper p-3 font-mono text-[12.5px] whitespace-pre-wrap">{s.answerText ?? s.selectedOptionIds.join(", ")}</pre><AnswerFeedback q={pq.question} s={s} onSelfGrade={(vd) => selfGrade.mutate({ sid: s.id, verdict: vd })} grading={selfGrade.isPending} /></> : <AnswerFeedback q={pq.question} s={{ id: "", verdict: "INCORRECT", gradingMethod: null, score: 0, maxScore: pq.marks, answerText: null, selectedOptionIds: [], feedback: "Not attempted.", mistakes: null, criteriaResults: null, suggestedMark: null, submittedAt: "" }} />}</div>}
                </li>
              );
            })}
          </ol>
        </Section>
      </div>
    </div>
  );
}
