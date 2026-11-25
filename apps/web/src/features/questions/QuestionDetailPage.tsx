import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Bookmark, ExternalLink, Eye, Pencil, Play, Star, Trash2 } from "lucide-react";
import { DIFFICULTY_LABEL, QUESTION_SOURCE_LABEL, QUESTION_TYPE_LABEL, languageLabel, type QuestionSource, type QuestionType } from "@code-junk/shared";
import { Badge, Button, ButtonLink, QueryView, Section, Textarea, errorMessage, useConfirm, useToast } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDateTime, relative } from "@/lib/format";
import { startPractice, useQuestion, useQuestionMutations, type QuestionFull } from "./api";
import { MarkPicker } from "./MarkPicker";

const VERDICT_TONE = { CORRECT: "green", PARTIAL: "yellow", INCORRECT: "red", UNGRADED: "neutral" } as const;

export default function QuestionDetailPage() {
  const { id = "" } = useParams();
  const q = useQuestion(id);
  return <QueryView query={q}>{(question) => <Detail q={question} />}</QueryView>;
}

function Detail({ q }: { q: QuestionFull }) {
  const m = useQuestionMutations();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [reveal, setReveal] = useState(false);
  const [notes, setNotes] = useState(q.personalNotes ?? "");
  const [starting, setStarting] = useState(false);

  const practise = async () => {
    setStarting(true);
    try {
      navigate(`/app/practice/attempts/${await startPractice({ source: "questions", questionIds: [q.id] })}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <div>
      <Link to="/app/library" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Library</Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{q.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone="outline">{QUESTION_TYPE_LABEL[q.type as QuestionType]}</Badge>
            <Badge>{DIFFICULTY_LABEL[q.difficulty as keyof typeof DIFFICULTY_LABEL]}</Badge>
            {q.language && <Badge tone="accent">{languageLabel(q.language)}</Badge>}
            <span>{q.subject.name}{q.topic ? ` · ${q.topic.name}` : ""}</span>
            <span>· {QUESTION_SOURCE_LABEL[q.source as QuestionSource]}</span>
            {!q.inLibrary && <Badge tone="yellow">Not in library</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Play />} loading={starting} onClick={() => void practise()}>Practise</Button>
          {!q.inLibrary && <Button size="sm" variant="secondary" onClick={() => m.update.mutate({ id: q.id, inLibrary: true }, { onSuccess: () => toast.success("Saved to your library.") })}>Save to library</Button>}
          <Button size="icon-sm" variant="secondary" aria-label={q.isFavorite ? "Unfavourite" : "Favourite"} aria-pressed={q.isFavorite} onClick={() => m.update.mutate({ id: q.id, isFavorite: !q.isFavorite })}><Star className={cn(q.isFavorite && "fill-mark-yellow text-mark-yellow")} /></Button>
          <Button size="icon-sm" variant="secondary" aria-label={q.isBookmarked ? "Remove bookmark" : "Bookmark"} aria-pressed={q.isBookmarked} onClick={() => m.update.mutate({ id: q.id, isBookmarked: !q.isBookmarked })}><Bookmark className={cn(q.isBookmarked && "fill-accent text-accent")} /></Button>
          <ButtonLink size="sm" variant="secondary" to={`/app/library/questions/${q.id}/edit`} leftIcon={<Pencil />}>Edit</ButtonLink>
          <Button size="icon-sm" variant="ghost" aria-label="Delete question" onClick={async () => { if (await confirm({ title: "Remove this question?", body: "It's removed from your library. If a quiz or paper uses it, your attempt history there is kept.", danger: true, confirmLabel: "Remove" })) m.remove.mutate(q.id, { onSuccess: () => navigate("/app/library") }); }}><Trash2 /></Button>
        </div>
      </div>

      <div className="mb-5"><MarkPicker value={q.colorMark} onChange={(mark) => m.mark.mutate({ id: q.id, colorMark: mark })} /></div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Section title="Question">
            <Markdown text={q.body} />
            {q.options && (
              <ol className="mt-3 space-y-1.5">
                {q.options.map((o) => (
                  <li key={o.id} className={cn("flex gap-2 rounded-md border px-3 py-2 text-sm", reveal && q.correctOptionIds.includes(o.id) ? "border-mark-green/40 bg-mark-green-soft" : "border-line")}>
                    <span className="font-mono font-medium">{o.id}</span><span>{o.text}</span>
                  </li>
                ))}
              </ol>
            )}
            {q.sourceUrl && <a href={q.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">Open original{q.sourceAttribution ? ` on ${q.sourceAttribution}` : ""} <ExternalLink className="size-3.5" /></a>}
          </Section>
          <Section title="Answer & explanation" action={!reveal && <Button size="sm" variant="secondary" leftIcon={<Eye />} onClick={() => setReveal(true)}>Show answer</Button>}>
            {reveal ? (
              <div className="space-y-4">
                {q.correctOptionIds.length > 0 && <p className="text-sm"><span className="font-medium">Correct option:</span> {q.correctOptionIds.join(", ")}</p>}
                {q.expectedAnswer && <div><p className="mb-1 text-xs font-medium text-muted uppercase">Expected answer</p><Markdown text={q.expectedAnswer} /></div>}
                {q.solution && <div><p className="mb-1 text-xs font-medium text-muted uppercase">Solution</p><Markdown text={q.solution} /></div>}
                {q.explanation && <div><p className="mb-1 text-xs font-medium text-muted uppercase">Explanation</p><Markdown text={q.explanation} /></div>}
                {!q.expectedAnswer && !q.solution && !q.explanation && !q.correctOptionIds.length && <p className="text-sm text-muted">No answer saved for this question yet. Edit it to add one.</p>}
                {q.concepts.length > 0 && <div className="flex flex-wrap gap-1.5">{q.concepts.map((c) => <Badge key={c} tone="outline">{c}</Badge>)}</div>}
              </div>
            ) : (
              <p className="text-sm text-muted">Hidden so you can try it first.</p>
            )}
          </Section>
          <Section title="My notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tricks, mistakes to avoid, links…" className="min-h-24" />
            <div className="mt-2 flex justify-end"><Button size="sm" disabled={notes === (q.personalNotes ?? "")} loading={m.update.isPending} onClick={() => m.update.mutate({ id: q.id, personalNotes: notes }, { onSuccess: () => toast.success("Notes saved.") })}>Save notes</Button></div>
          </Section>
        </div>
        <div className="space-y-5">
          <Section title="Revision">
            {q.revisionItem ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted">Next review</dt><dd>{relative(q.revisionItem.nextReviewAt)}</dd>
                <dt className="text-muted">Status</dt><dd className="capitalize">{q.revisionItem.status.toLowerCase()}</dd>
                <dt className="text-muted">Correct streak</dt><dd>{q.revisionItem.repetitions}</dd>
                <dt className="text-muted">Times wrong</dt><dd>{q.revisionItem.lapses}</dd>
                <dt className="text-muted">Reviews</dt><dd>{q.revisionItem.totalReviews}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">Not in your revision queue. It joins automatically if you answer it wrongly or mark it red or yellow.</p>
            )}
          </Section>
          <Section title={`Attempts (${q.submissions.length})`}>
            {q.submissions.length === 0 ? (
              <p className="text-sm text-muted">You haven't answered this question yet.</p>
            ) : (
              <ul className="space-y-2">
                {q.submissions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span title={fmtDateTime(s.submittedAt)} className="text-ink-2">{fmtDate(s.submittedAt)}</span>
                    <Badge tone={VERDICT_TONE[s.verdict]}>{s.verdict === "UNGRADED" ? "Not graded" : s.verdict.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {(q.tags.length > 0 || q.sourceDocument) && (
            <Section title="Details">
              {q.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{q.tags.map((t) => <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">#{t}</span>)}</div>}
              {q.sourceDocument && <p className="mt-2 text-xs text-muted">Imported from {q.sourceDocument.originalName}</p>}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
