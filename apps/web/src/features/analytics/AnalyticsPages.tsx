import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Flame, Lightbulb, RotateCcw, TrendingUp, TriangleAlert } from "lucide-react";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, languageLabel, type QuestionType } from "@code-junk/shared";
import { EmptyState, PageHeader, QueryView, Section, Segmented, StatTile, TabLinks } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtMinutes, pct } from "@/lib/format";

function Tabs() {
  return (
    <>
      <PageHeader title="Progress & Analytics" description="Calculated from your real answers, study sessions and revision. Nothing is estimated or made up." />
      <TabLinks className="mb-6" tabs={[{ to: "/app/analytics", label: "Overall", end: true }, { to: "/app/analytics/subjects", label: "Subjects & topics" }, { to: "/app/analytics/coding", label: "Coding practice" }, { to: "/app/analytics/revision", label: "Revision" }, { to: "/app/analytics/study-time", label: "Study time" }]} />
    </>
  );
}

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 };
const axis = { tickLine: false, axisLine: false, tick: { fill: "var(--muted)", fontSize: 11 } };
const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });

interface Day { date: string; studyMins: number; plannedMins: number; attempts: number; accuracy: number | null; revisions: number; completedSessions: number }
const useSeries = (days: number) => useQuery({ queryKey: ["analytics", "ts", days], queryFn: async () => (await api<{ days: Day[] }>(`/analytics/timeseries?days=${days}`)).days });

function NoData({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted">{text}</p>;
}

const INSIGHT_ICON = { weak: TriangleAlert, improving: TrendingUp, revision: RotateCcw, neglected: AlertTriangle, streak: Flame, start: Lightbulb };

export function OverallPage() {
  const ov = useQuery({ queryKey: ["analytics", "overview"], queryFn: () => api<{ attempted: number; correct: number; partial: number; incorrect: number; accuracy: number | null; studyHours: number; snippets: number; questionsSaved: number; quizzesCompleted: number; papersAttempted: number; goalsCompleted: number; goalsTotal: number; revisionCompletion: number | null; streak: number }>("/analytics/overview") });
  const insights = useQuery({ queryKey: ["analytics", "insights"], queryFn: async () => (await api<{ insights: { kind: keyof typeof INSIGHT_ICON; text: string; link?: string }[] }>("/analytics/insights")).insights });
  const diff = useQuery({ queryKey: ["analytics", "difficulty"], queryFn: async () => (await api<{ difficulty: { difficulty: string; attempts: number; accuracy: number | null }[] }>("/analytics/difficulty")).difficulty });
  const [range, setRange] = useState<"30" | "90">("30");
  const ts = useSeries(Number(range));
  return (
    <div>
      <Tabs />
      <QueryView query={ov}>
        {(o) => (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <StatTile label="Attempted" value={o.attempted} />
            <StatTile label="Correct" value={o.correct} hint={`${o.partial} partial`} />
            <StatTile label="Incorrect" value={o.incorrect} />
            <StatTile label="Accuracy" value={pct(o.accuracy)} hint={o.accuracy === null ? "no answers yet" : "partial = half"} />
            <StatTile label="Study time" value={`${o.studyHours} h`} />
            <StatTile label="Snippets" value={o.snippets} />
            <StatTile label="Quizzes done" value={o.quizzesCompleted} />
            <StatTile label="Papers" value={o.papersAttempted} />
            <StatTile label="Goals" value={`${o.goalsCompleted}/${o.goalsTotal}`} />
            <StatTile label="Revision done" value={pct(o.revisionCompletion)} hint={`streak ${o.streak} d`} />
          </div>
        )}
      </QueryView>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Section title="Activity" action={<Segmented ariaLabel="Range" value={range} onChange={setRange} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />}>
          <QueryView query={ts}>
            {(days) => days.every((d) => !d.attempts && !d.studyMins) ? <NoData text="No activity in this period yet." /> : (
              <div className="space-y-6">
                <div className="h-48" role="img" aria-label="Questions attempted per day"><p className="mb-1 text-xs text-muted">Questions attempted</p><ResponsiveContainer><BarChart data={days}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={20} /><YAxis {...axis} width={28} allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => short(String(l))} /><Bar dataKey="attempts" name="Questions" fill="var(--accent)" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div>
                <div className="h-48" role="img" aria-label="Accuracy per day"><p className="mb-1 text-xs text-muted">Accuracy (%) on days you practised</p><ResponsiveContainer><LineChart data={days}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={20} /><YAxis {...axis} width={28} domain={[0, 100]} /><Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => short(String(l))} /><Line dataKey="accuracy" name="Accuracy" stroke="var(--mark-green)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} /></LineChart></ResponsiveContainer></div>
              </div>
            )}
          </QueryView>
        </Section>
        <div className="space-y-5">
          <Section title="Insights">
            <QueryView query={insights}>
              {(list) => list.length === 0 ? <p className="text-sm text-muted">Not enough data for insights yet. Keep practising.</p> : (
                <ul className="space-y-3">{list.map((i, k) => { const Icon = INSIGHT_ICON[i.kind]; return <li key={k} className="flex gap-2.5 text-sm"><Icon className={cn("mt-0.5 size-4 shrink-0", i.kind === "weak" || i.kind === "neglected" ? "text-mark-yellow" : i.kind === "improving" || i.kind === "streak" ? "text-mark-green" : "text-accent")} />{i.link ? <Link to={i.link} className="hover:underline">{i.text}</Link> : <span>{i.text}</span>}</li>; })}</ul>
              )}
            </QueryView>
          </Section>
          <Section title="By difficulty">
            <QueryView query={diff}>
              {(rows) => rows.every((r) => !r.attempts) ? <p className="text-sm text-muted">No answers yet.</p> : (
                <ul className="space-y-2.5">{rows.filter((r) => r.attempts).map((r) => <li key={r.difficulty}><div className="flex justify-between text-sm"><span>{DIFFICULTY_LABEL[r.difficulty as keyof typeof DIFFICULTY_LABEL]}</span><span className="font-mono text-xs text-muted">{pct(r.accuracy)} · {r.attempts}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${r.accuracy ?? 0}%` }} /></div></li>)}</ul>
              )}
            </QueryView>
          </Section>
        </div>
      </div>
    </div>
  );
}

interface SubjectStat { id: string; name: string; topics: number; topicsStudied: number; topicsCompleted: number; attempted: number; accuracy: number | null; avgDifficulty: string | null; studyMinutes: number; weakTopics: string[] }
interface TopicStat { topicId: string | null; topic: string; subject: string; attempts: number; accuracy: number | null; enoughData: boolean; recentAccuracy: number | null; previousAccuracy: number | null }

export function SubjectsAnalyticsPage() {
  const subjects = useQuery({ queryKey: ["analytics", "subjects"], queryFn: async () => (await api<{ subjects: SubjectStat[] }>("/analytics/subjects")).subjects });
  const [subjectId, setSubjectId] = useState<string>("");
  const topics = useQuery({ queryKey: ["analytics", "topics", subjectId], queryFn: async () => (await api<{ topics: TopicStat[] }>(`/analytics/topics${subjectId ? `?subjectId=${subjectId}` : ""}`)).topics });
  return (
    <div>
      <Tabs />
      <QueryView query={subjects}>
        {(list) => list.length === 0 ? <EmptyState title="No subjects yet" description="Create subjects and practise to see subject analytics." /> : (
          <div className="mb-6 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr>{["Subject", "Topics studied", "Mastered", "Questions", "Accuracy", "Avg difficulty", "Time", "Weak topics"].map((h) => <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((s) => (
                  <tr key={s.id} className={cn("cursor-pointer hover:bg-surface-2/50", subjectId === s.id && "bg-accent-soft/40")} onClick={() => setSubjectId(subjectId === s.id ? "" : s.id)}>
                    <td className="px-4 py-2.5 font-medium">{s.name}</td><td className="px-4 py-2.5">{s.topicsStudied}/{s.topics}</td><td className="px-4 py-2.5">{s.topicsCompleted}</td><td className="px-4 py-2.5">{s.attempted}</td><td className="px-4 py-2.5">{pct(s.accuracy)}</td><td className="px-4 py-2.5">{s.avgDifficulty ? DIFFICULTY_LABEL[s.avgDifficulty as keyof typeof DIFFICULTY_LABEL] : "–"}</td><td className="px-4 py-2.5 whitespace-nowrap">{fmtMinutes(s.studyMinutes)}</td><td className="px-4 py-2.5 text-mark-red">{s.weakTopics.join(", ") || <span className="text-muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      <Section title={`Topic performance${subjectId ? ` · ${subjects.data?.find((s) => s.id === subjectId)?.name}` : " · all subjects"}`}>
        <QueryView query={topics}>
          {(list) => list.length === 0 ? <NoData text="Answer questions to see topic accuracy." /> : (
            <ul className="space-y-3">
              {list.map((t) => (
                <li key={`${t.subject}-${t.topic}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span><span className="font-medium">{t.topic}</span> <span className="text-xs text-muted">{t.subject}</span></span>
                    <span className="font-mono text-xs text-muted">{t.enoughData ? `${t.accuracy}%` : `${t.attempts} answer${t.attempts === 1 ? "" : "s"} — need 5 for a reliable figure`}{t.recentAccuracy !== null && t.previousAccuracy !== null ? ` · ${t.recentAccuracy >= t.previousAccuracy ? "↑" : "↓"} from ${t.previousAccuracy}%` : ""}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className={cn("h-full rounded-full", !t.enoughData ? "bg-line-strong" : (t.accuracy ?? 0) >= 75 ? "bg-mark-green" : (t.accuracy ?? 0) >= 50 ? "bg-mark-yellow" : "bg-mark-red")} style={{ width: `${t.accuracy ?? 0}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
    </div>
  );
}

export function CodingAnalyticsPage() {
  const q = useQuery({ queryKey: ["analytics", "coding"], queryFn: () => api<{ total: number; byType: { key: string; attempts: number; correct: number }[]; byLanguage: { key: string; attempts: number; correct: number }[] }>("/analytics/coding") });
  const Bars = ({ rows, label }: { rows: { key: string; attempts: number; correct: number }[]; label: (k: string) => string }) => (
    <ul className="space-y-3">{rows.map((r) => <li key={r.key}><div className="flex justify-between text-sm"><span>{label(r.key)}</span><span className="font-mono text-xs text-muted">{r.correct}/{r.attempts} correct</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.correct / r.attempts) * 100}%` }} /></div></li>)}</ul>
  );
  return (
    <div>
      <Tabs />
      <QueryView query={q}>
        {(d) => d.total === 0 ? <EmptyState title="No coding questions answered yet" description="Coding, debugging, output-prediction and problem-solving answers are analysed here." /> : (
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="By question type"><Bars rows={d.byType} label={(k) => QUESTION_TYPE_LABEL[k as QuestionType] ?? k} /></Section>
            <Section title="By language"><Bars rows={d.byLanguage} label={(k) => (k === "none" ? "No language" : languageLabel(k))} /></Section>
          </div>
        )}
      </QueryView>
    </div>
  );
}

export function RevisionAnalyticsPage() {
  const q = useQuery({ queryKey: ["analytics", "revision"], queryFn: () => api<{ byStatus: Record<string, number>; totalReviews: number; weekly: { week: string; reviews: number; accuracy: number | null }[] }>("/analytics/revision") });
  return (
    <div>
      <Tabs />
      <QueryView query={q}>
        {(d) => (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="Reviews" value={d.totalReviews} />
              <StatTile label="Learning" value={d.byStatus.LEARNING ?? 0} />
              <StatTile label="Reviewing" value={d.byStatus.REVIEWING ?? 0} />
              <StatTile label="Mastered" value={d.byStatus.MASTERED ?? 0} />
              <StatTile label="Suspended" value={d.byStatus.SUSPENDED ?? 0} />
            </div>
            <Section title="Revision accuracy by week">
              {d.weekly.length === 0 ? <NoData text="Revise some questions to see your improvement here." /> : (
                <div className="h-60" role="img" aria-label="Revision accuracy per week"><ResponsiveContainer><LineChart data={d.weekly}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="week" tickFormatter={short} {...axis} /><YAxis {...axis} width={28} domain={[0, 100]} /><Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Week of ${short(String(l))}`} /><Line dataKey="accuracy" name="Accuracy %" stroke="var(--accent)" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
              )}
            </Section>
          </>
        )}
      </QueryView>
    </div>
  );
}

export function StudyTimePage() {
  const [range, setRange] = useState<"30" | "90">("30");
  const ts = useSeries(Number(range));
  return (
    <div>
      <Tabs />
      <QueryView query={ts}>
        {(days) => {
          const planned = days.reduce((s, d) => s + d.plannedMins, 0);
          const actual = days.reduce((s, d) => s + d.studyMins, 0);
          const weeks: { week: string; planned: number; actual: number }[] = [];
          days.forEach((d, i) => { const w = Math.floor(i / 7); weeks[w] ??= { week: d.date, planned: 0, actual: 0 }; weeks[w]!.planned += d.plannedMins; weeks[w]!.actual += d.studyMins; });
          return (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-lg"><StatTile label="Planned" value={fmtMinutes(planned)} /><StatTile label="Studied" value={fmtMinutes(actual)} /><StatTile label="Of plan" value={planned ? `${Math.round((actual / planned) * 100)}%` : "–"} /></div>
                <Segmented ariaLabel="Range" value={range} onChange={setRange} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
              </div>
              <Section title="Planned vs studied, by week">
                {planned + actual === 0 ? <NoData text="Schedule and complete study sessions, or use the focus timer, to see study time." /> : (
                  <div className="h-64" role="img" aria-label="Planned and studied minutes per week"><ResponsiveContainer><BarChart data={weeks}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="week" tickFormatter={short} {...axis} /><YAxis {...axis} width={36} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} min`} labelFormatter={(l) => `Week of ${short(String(l))}`} /><Bar dataKey="planned" name="Planned" fill="var(--line-strong)" radius={[2, 2, 0, 0]} /><Bar dataKey="actual" name="Studied" fill="var(--accent)" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div>
                )}
              </Section>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
