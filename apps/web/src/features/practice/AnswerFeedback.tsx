import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from "lucide-react";
import type { ColorMark } from "@code-junk/shared";
import { Badge, Button } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";
import type { Submission } from "@/features/questions/api";

export interface RevealedQuestion {
  id: string;
  type: string;
  options: { id: string; text: string }[] | null;
  correctOptionIds?: string[];
  expectedAnswer?: string | null;
  solution?: string | null;
  explanation?: string | null;
  concepts?: string[];
  colorMark: ColorMark | null;
}

const VERDICT = {
  CORRECT: { label: "Correct", icon: CheckCircle2, cls: "border-mark-green/40 bg-mark-green-soft text-mark-green" },
  PARTIAL: { label: "Partially correct", icon: MinusCircle, cls: "border-mark-yellow/40 bg-mark-yellow-soft text-mark-yellow" },
  INCORRECT: { label: "Incorrect", icon: XCircle, cls: "border-mark-red/40 bg-mark-red-soft text-mark-red" },
  UNGRADED: { label: "Grade it yourself", icon: CircleDashed, cls: "border-line bg-surface-2 text-ink-2" },
} as const;

/** Evaluation result + reference answer, shown after a question is submitted. */
export function AnswerFeedback({ q, s, onSelfGrade, grading }: { q: RevealedQuestion; s: Submission; onSelfGrade?: (v: "CORRECT" | "PARTIAL" | "INCORRECT") => void; grading?: boolean }) {
  const v = VERDICT[s.verdict];
  const extra = s.criteriaResults;
  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3", v.cls)} role="status">
        <v.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{v.label}{s.score !== null && s.maxScore ? <span className="ml-2 font-normal">{Math.round(s.score * 100) / 100} / {s.maxScore}</span> : null}</p>
          {s.feedback && <p className="mt-1 text-sm text-ink">{s.feedback}</p>}
          {s.verdict === "UNGRADED" && <p className="mt-1 text-sm text-ink">No AI provider is available to grade this answer. Compare it with the reference below and grade yourself honestly.</p>}
        </div>
        {s.gradingMethod && s.verdict !== "UNGRADED" && <Badge tone="outline" className="bg-surface">{s.gradingMethod === "AI_RUBRIC" ? "AI-assessed" : s.gradingMethod === "SELF_ASSESSED" ? "Self-assessed" : "Checked exactly"}</Badge>}
      </div>

      {s.verdict === "UNGRADED" && onSelfGrade && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={grading} onClick={() => onSelfGrade("CORRECT")}>I got it right</Button>
          <Button size="sm" variant="secondary" loading={grading} onClick={() => onSelfGrade("PARTIAL")}>Partly right</Button>
          <Button size="sm" variant="secondary" loading={grading} onClick={() => onSelfGrade("INCORRECT")}>I got it wrong</Button>
        </div>
      )}

      {s.mistakes && s.mistakes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Mistakes</p>
          <ul className="space-y-1 text-sm">{s.mistakes.map((m, i) => <li key={i} className="flex gap-2"><span className="text-mark-red">•</span><span>{m.location && <span className="font-mono text-xs text-muted">{m.location}: </span>}{m.description}</span></li>)}</ul>
        </div>
      )}
      {extra?.improvements && extra.improvements.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">How to improve</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{extra.improvements.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {q.type === "MCQ" && q.correctOptionIds && (
        <p className="text-sm"><span className="font-medium">Correct answer:</span> {q.correctOptionIds.map((id) => `${id}) ${q.options?.find((o) => o.id === id)?.text ?? ""}`).join(", ")}</p>
      )}
      {q.expectedAnswer && q.type !== "MCQ" && <div><p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Expected answer</p>{q.type === "OUTPUT_PREDICTION" ? <pre className="rounded-md border border-line bg-code-bg p-3 font-mono text-[12.5px] whitespace-pre-wrap">{q.expectedAnswer}</pre> : <Markdown text={q.expectedAnswer} />}</div>}
      {q.solution && <div><p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Solution</p><Markdown text={q.solution} /></div>}
      {q.explanation && <div><p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Explanation</p><Markdown text={q.explanation} /></div>}
      {((q.concepts?.length ?? 0) > 0 || (extra?.concepts?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted">Concepts:</span>{[...new Set([...(q.concepts ?? []), ...(extra?.concepts ?? [])])].map((c) => <Badge key={c} tone="outline">{c}</Badge>)}</div>
      )}
    </div>
  );
}
