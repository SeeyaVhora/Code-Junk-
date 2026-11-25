import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCcw } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, MarkDot, PageHeader, QueryView, Section, StatTile, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, relative } from "@/lib/format";
import { startPractice } from "@/features/questions/api";

interface Summary {
  overdue: number;
  dueToday: number;
  dueNow: number;
  upcoming: number;
  mastered: number;
  red: number;
  yellow: number;
  total: number;
  revisionDay: number;
  sessionSize: number;
  todayIsRevisionDay: boolean;
  weeklyCompletedToday: boolean;
  frequentlyWrong: { lapses: number; nextReviewAt: string; question: { id: string; title: string; subject: { name: string } } }[];
  recentlyMastered: { lastReviewedAt: string; question: { id: string; title: string } }[];
}
interface QueueItem {
  id: string;
  questionId: string;
  nextReviewAt: string;
  status: string;
  lapses: number;
  repetitions: number;
  reason: string;
  bucket: "overdue" | "today" | "upcoming" | "suspended";
  question: { id: string; title: string; colorMark: "GREEN" | "YELLOW" | "RED" | null; subject: { name: string }; topic: { name: string } | null };
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function RevisionPage() {
  const summary = useQuery({ queryKey: ["revision", "summary"], queryFn: () => api<Summary>("/revision/summary") });
  const queue = useQuery({ queryKey: ["revision", "queue"], queryFn: async () => (await api<{ items: QueueItem[] }>("/revision/queue")).items });
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [override, setOverride] = useState<QueueItem | null>(null);
  const [date, setDate] = useState("");
  const setDue = useMutation({
    mutationFn: () => api(`/revision/items/${override!.questionId}`, { method: "PATCH", body: { nextReviewAt: new Date(date + "T09:00:00").toISOString() } }),
    onSuccess: () => { toast.success("Revision date changed."); setOverride(null); void qc.invalidateQueries({ queryKey: ["revision"] }); },
    onError: toast.error,
  });

  const start = async () => {
    setStarting(true);
    try {
      navigate(`/app/practice/attempts/${await startPractice({ source: "revision", limit: summary.data?.sessionSize ?? 20 })}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Smart Revision" description="Questions you got wrong or marked red/yellow come back on a spaced-repetition schedule until you've mastered them." actions={<Button leftIcon={<Play />} loading={starting} disabled={!summary.data || (summary.data.dueNow === 0 && !(summary.data.todayIsRevisionDay && summary.data.red + summary.data.yellow > 0))} onClick={() => void start()}>Start revision</Button>} />
      <QueryView query={summary}>
        {(s) => (
          <>
            <div className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              {s.todayIsRevisionDay ? (s.weeklyCompletedToday ? "✅ You've done this week's revision session." : <><strong>Today is your weekly revision day.</strong> The session includes everything due plus all your red and yellow questions.</>) : <>Your weekly revision day is <strong>{DAYS[s.revisionDay]}</strong>. <Link to="/app/settings/learning" className="text-accent hover:underline">Change it</Link></>}
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <StatTile label="Due now" value={s.dueNow} />
              <StatTile label="Overdue" value={s.overdue} />
              <StatTile label="Today" value={s.dueToday} />
              <StatTile label="Next 7 days" value={s.upcoming} />
              <StatTile label="Mastered" value={s.mastered} />
              <StatTile label="Red" value={s.red} icon={<MarkDot mark="RED" />} />
              <StatTile label="Yellow" value={s.yellow} icon={<MarkDot mark="YELLOW" />} />
            </div>
            {s.total === 0 ? (
              <EmptyState icon={<RotateCcw />} title="Nothing to revise yet" description="When you answer a question incorrectly, or mark one red or yellow, it's added here automatically." action={<Link to="/app/practice" className="text-sm text-accent hover:underline">Practise some questions</Link>} />
            ) : (
              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Section title="Revision queue">
                  <QueryView query={queue}>
                    {(items) => (
                      <div className="space-y-5">
                        {(["overdue", "today", "upcoming"] as const).map((b) => {
                          const rows = items.filter((i) => i.bucket === b);
                          if (!rows.length) return null;
                          return (
                            <div key={b}>
                              <p className="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">{b === "today" ? "Due today" : b}</p>
                              <ul className="divide-y divide-line">
                                {rows.slice(0, 50).map((i) => (
                                  <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                                    {i.question.colorMark ? <MarkDot mark={i.question.colorMark} /> : <span className="size-2" />}
                                    <Link to={`/app/library/questions/${i.question.id}`} className="min-w-0 flex-1 truncate hover:underline">{i.question.title}</Link>
                                    <span className="hidden text-xs text-muted sm:inline">{i.question.subject.name}</span>
                                    {i.status === "MASTERED" && <Badge tone="green">mastered</Badge>}
                                    <button type="button" className="text-xs text-ink-2 hover:text-ink" title={fmtDateTime(i.nextReviewAt)} onClick={() => { setOverride(i); setDate(new Date(i.nextReviewAt).toISOString().slice(0, 10)); }}>
                                      {relative(i.nextReviewAt)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </QueryView>
                </Section>
                <div className="space-y-5">
                  <Section title="Frequently wrong">
                    {s.frequentlyWrong.length === 0 ? <p className="text-sm text-muted">No question has been wrong twice yet.</p> : <ul className="space-y-2">{s.frequentlyWrong.map((f) => <li key={f.question.id} className="flex justify-between gap-2 text-sm"><Link to={`/app/library/questions/${f.question.id}`} className="truncate hover:underline">{f.question.title}</Link><Badge tone="red">{f.lapses}×</Badge></li>)}</ul>}
                  </Section>
                  <Section title="Recently mastered">
                    {s.recentlyMastered.length === 0 ? <p className="text-sm text-muted">Mastery takes three correct reviews in a row, spaced weeks apart.</p> : <ul className="space-y-2">{s.recentlyMastered.map((f) => <li key={f.question.id} className="flex justify-between gap-2 text-sm"><Link to={`/app/library/questions/${f.question.id}`} className="truncate hover:underline">{f.question.title}</Link><span className="text-xs text-muted">{fmtDate(f.lastReviewedAt)}</span></li>)}</ul>}
                  </Section>
                </div>
              </div>
            )}
          </>
        )}
      </QueryView>
      <Dialog open={!!override} onClose={() => setOverride(null)} title="Change revision date" size="sm" footer={<><Button variant="secondary" onClick={() => setOverride(null)}>Cancel</Button><Button loading={setDue.isPending} disabled={!date} onClick={() => setDue.mutate()}>Save</Button></>}>
        <p className="mb-3 text-sm text-ink-2">{override?.question.title}</p>
        <Field label="Revise on" hint="Your answer next time still updates the schedule automatically.">{(a) => <Input {...a} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}
