import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  FileText,
  Flame,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { EVENT_CATEGORY_LABEL, type EventCategory } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Dialog, EmptyState, Field, Input, LoadingBlock, MarkDot, QueryView, Section, StatTile, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDay, fmtLongDay, fmtMinutes, fmtTime, fromLocalInput, greeting, pct, relative, toLocalInput } from "@/lib/format";
import { useSession } from "@/features/auth/api";

interface Session {
  id: string;
  title: string;
  startsAt: string;
  plannedMins: number;
  actualMins: number | null;
  status: string;
  priority: string;
  elapsedSecs: number;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
}
interface Deadline {
  id: string;
  title: string;
  category: EventCategory;
  startsAt: string;
  allDay: boolean;
  overdue: boolean;
  subject: { name: string } | null;
  assignment: { submissionStatus: string } | null;
  examination: { preparationStatus: string } | null;
}
interface Dashboard {
  today: Session[];
  deadlines: Deadline[];
  continue: {
    items: { type: "snippet" | "quiz" | "paper"; id: string; title: string; meta: string }[];
    quizzes: { id: string; quiz: { id: string; title: string; _count: { questions: number } }; _count: { submissions: number } }[];
    papers: { id: string; paper: { id: string; title: string } }[];
    topics: { id: string; name: string; subject: { id: string; name: string } }[];
  };
  revision: { dueNow: number; overdue: number; dueToday: number; red: number; yellow: number; todayIsRevisionDay: boolean; weeklyCompletedToday: boolean; revisionDay: number };
  stats: { attempted: number; correct: number; accuracy: number | null; snippets: number; studyHours: number; streak: number; goalsCompleted: number; weekStudyMins: number };
  week: { date: string; studyMins: number; plannedMins: number; attempts: number; revisions: number; completedSessions: number }[];
}

export const dashboardKey = ["dashboard"] as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CATEGORY_BAR: Record<EventCategory, string> = {
  EXAMINATION: "bg-cat-exam",
  ASSIGNMENT: "bg-cat-assignment",
  COLLEGE_EVENT: "bg-cat-college",
  LEARNING_DEADLINE: "bg-cat-deadline",
  PERSONAL: "bg-cat-personal",
};

export default function DashboardPage() {
  const { data: user } = useSession();
  const q = useQuery({ queryKey: dashboardKey, queryFn: () => api<Dashboard>("/dashboard") });
  const first = user?.name.split(" ")[0] ?? "";

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs text-muted">{fmtLongDay(new Date())}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
          {greeting()}, {first}!
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          {q.data
            ? q.data.today.length
              ? `You have ${q.data.today.length} study session${q.data.today.length === 1 ? "" : "s"} planned today${q.data.revision.dueNow ? ` and ${q.data.revision.dueNow} question${q.data.revision.dueNow === 1 ? "" : "s"} to revise` : ""}.`
              : q.data.revision.dueNow
                ? `${q.data.revision.dueNow} question${q.data.revision.dueNow === 1 ? " is" : "s are"} waiting for revision.`
                : "Nothing scheduled yet today. Plan a session or practise a few questions."
            : " "}
        </p>
      </div>

      <QueryView query={q} loading={<LoadingBlock rows={6} />}>
        {(d) => (
          <div className="space-y-5">
            <Stats s={d.stats} />
            <QuickActions />
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <TodayLearning sessions={d.today} />
              <Deadlines items={d.deadlines} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <Revision r={d.revision} />
              <ContinueLearning c={d.continue} />
            </div>
            <Weekly week={d.week} />
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Stats({ s }: { s: Dashboard["stats"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatTile label="Attempted" value={s.attempted} />
      <StatTile label="Correct" value={s.correct} />
      <StatTile label="Accuracy" value={pct(s.accuracy)} hint={s.accuracy === null ? "No answers yet" : undefined} />
      <StatTile label="Snippets" value={s.snippets} />
      <StatTile label="Study time" value={`${s.studyHours} h`} hint={`${fmtMinutes(s.weekStudyMins)} this week`} />
      <StatTile label="Streak" value={`${s.streak} d`} icon={<Flame />} />
      <StatTile label="Goals done" value={s.goalsCompleted} icon={<Target />} />
    </div>
  );
}

function QuickActions() {
  const actions = [
    { to: "/app/booklet/new", label: "Add snippet", icon: BookOpen },
    { to: "/app/practice", label: "Generate questions", icon: Sparkles },
    { to: "/app/practice/short", label: "Short practice", icon: Play },
    { to: "/app/practice/long", label: "Long practice", icon: FileText },
    { to: "/app/papers/new", label: "Practice paper", icon: FileText },
    { to: "/app/planner/goals?new=1", label: "Learning goal", icon: Target },
    { to: "/app/planner?new=session", label: "Study session", icon: ClipboardList },
    { to: "/app/calendar?new=1", label: "Calendar event", icon: CalendarPlus },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {actions.map((a) => (
        <ButtonLink key={a.label} to={a.to} variant="secondary" size="sm" leftIcon={<a.icon />}>
          {a.label}
        </ButtonLink>
      ))}
    </div>
  );
}

function useSessionAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "start" | "complete" | "reschedule"; body?: object }) =>
      api(`/planner/sessions/${id}/${action}`, { method: "POST", body: body ?? {} }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: dashboardKey });
      void qc.invalidateQueries({ queryKey: ["planner"] });
      toast.success(v.action === "complete" ? "Session completed. Nice work!" : v.action === "start" ? "Session started. The timer is running." : "Session rescheduled.");
    },
    onError: toast.error,
  });
}

function TodayLearning({ sessions }: { sessions: Session[] }) {
  const act = useSessionAction();
  const [rescheduling, setRescheduling] = useState<Session | null>(null);
  const [when, setWhen] = useState("");
  return (
    <Section title="Today's learning" action={<Link to="/app/planner/day" className="text-xs text-ink-2 hover:text-ink">Daily plan →</Link>}>
      {sessions.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="Nothing planned for today" description="Schedule a study session and it will appear here and on your calendar." action={<ButtonLink to="/app/planner?new=session" size="sm" leftIcon={<Plus />}>Schedule a session</ButtonLink>} className="py-8" />
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => {
            const done = s.status === "COMPLETED";
            const running = s.status === "IN_PROGRESS";
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                {done ? <CheckCircle2 className="size-5 text-mark-green" aria-label="Completed" /> : <Circle className={cn("size-5", running ? "text-accent" : "text-line-strong")} aria-label={running ? "In progress" : "Not done"} />}
                <div className="min-w-0 flex-1">
                  <Link to={`/app/planner/sessions/${s.id}`} className={cn("text-sm font-medium hover:underline", done && "text-muted line-through")}>
                    {s.subject ? `${s.subject.name}${s.topic ? ` — ${s.topic.name}` : ""}` : s.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{fmtTime(s.startsAt)}</span>
                    <span>{fmtMinutes(s.plannedMins)}</span>
                    {s.priority !== "MEDIUM" && <Badge tone={s.priority === "HIGH" || s.priority === "CRITICAL" ? "red" : "neutral"} className="h-5">{s.priority.toLowerCase()}</Badge>}
                    {done && s.actualMins !== null && <span>studied {fmtMinutes(s.actualMins)}</span>}
                    {running && <span className="text-accent">in progress</span>}
                  </p>
                </div>
                {!done && (
                  <div className="flex gap-1.5">
                    {!running && <Button size="sm" variant="secondary" leftIcon={<Play />} onClick={() => act.mutate({ id: s.id, action: "start" })}>Start</Button>}
                    <Button size="sm" onClick={() => act.mutate({ id: s.id, action: "complete" })}>Complete</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRescheduling(s); setWhen(toLocalInput(new Date(Date.now() + 86_400_000))); }}>Reschedule</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={!!rescheduling}
        onClose={() => setRescheduling(null)}
        title="Reschedule session"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduling(null)}>Cancel</Button>
            <Button loading={act.isPending} disabled={!when} onClick={() => rescheduling && act.mutate({ id: rescheduling.id, action: "reschedule", body: { startsAt: fromLocalInput(when) } }, { onSuccess: () => setRescheduling(null) })}>Save</Button>
          </>
        }
      >
        <Field label="New date and time">{(a) => <Input {...a} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
      </Dialog>
    </Section>
  );
}

function Deadlines({ items }: { items: Deadline[] }) {
  return (
    <Section title="Upcoming deadlines" action={<Link to="/app/calendar" className="text-xs text-ink-2 hover:text-ink">Calendar →</Link>}>
      {items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="No upcoming deadlines" description="Add exams, assignments and college events to keep track of them here." action={<ButtonLink to="/app/calendar?new=1" size="sm" leftIcon={<Plus />}>Add event</ButtonLink>} className="py-8" />
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id}>
              <Link to={`/app/calendar?event=${e.id}`} className="flex items-center gap-3 rounded-md hover:bg-surface-2/60">
                <span className={cn("h-9 w-1 shrink-0 rounded-full", CATEGORY_BAR[e.category])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted">
                    {EVENT_CATEGORY_LABEL[e.category]}
                    {e.subject ? ` · ${e.subject.name}` : ""} · {e.allDay ? fmtDay(e.startsAt) : `${fmtDay(e.startsAt)} ${fmtTime(e.startsAt)}`}
                  </p>
                </div>
                <span className={cn("shrink-0 font-mono text-[11px]", e.overdue ? "text-mark-red" : "text-muted")}>{e.overdue ? "overdue" : relative(e.startsAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Revision({ r }: { r: Dashboard["revision"] }) {
  return (
    <Section title="Revision" action={<Link to="/app/revision" className="text-xs text-ink-2 hover:text-ink">Revision →</Link>}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-2xl font-semibold tabular-nums">{r.dueNow}</p><p className="text-xs text-muted">due now{r.overdue ? ` (${r.overdue} overdue)` : ""}</p></div>
        <div className="space-y-1">
          <p className="flex items-center gap-2"><MarkDot mark="RED" /> {r.red} red</p>
          <p className="flex items-center gap-2"><MarkDot mark="YELLOW" /> {r.yellow} yellow</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        {r.todayIsRevisionDay ? (r.weeklyCompletedToday ? "Weekly revision done today. 🎉" : "Today is your weekly revision day.") : `Weekly revision is on ${DAYS[r.revisionDay]}.`}
      </p>
      <ButtonLink to="/app/revision" className="mt-4 w-full" leftIcon={<RotateCcw />} variant={r.dueNow ? "primary" : "secondary"}>
        {r.dueNow ? "Start revision" : "Open revision"}
      </ButtonLink>
    </Section>
  );
}

function ContinueLearning({ c }: { c: Dashboard["continue"] }) {
  const empty = !c.items.length && !c.quizzes.length && !c.papers.length && !c.topics.length;
  const href = (t: string, id: string) => (t === "snippet" ? `/app/booklet/snippets/${id}` : t === "quiz" ? `/app/practice/quizzes/${id}` : `/app/papers/${id}`);
  return (
    <Section title="Continue learning">
      {empty ? (
        <EmptyState icon={<BookOpen />} title="Nothing to continue yet" description="Snippets you open, quizzes in progress and topics you study will show up here." action={<ButtonLink to="/app/booklet/new" size="sm" leftIcon={<Plus />}>Add your first snippet</ButtonLink>} className="py-8" />
      ) : (
        <div className="space-y-4">
          {(c.quizzes.length > 0 || c.papers.length > 0) && (
            <ul className="space-y-2">
              {c.quizzes.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{a.quiz.title}</p><p className="text-xs text-muted">{a._count.submissions} of {a.quiz._count.questions} answered</p></div>
                  <ButtonLink to={`/app/practice/attempts/${a.id}`} size="sm">Resume</ButtonLink>
                </li>
              ))}
              {c.papers.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{a.paper.title}</p><p className="text-xs text-muted">Practice paper in progress</p></div>
                  <ButtonLink to={`/app/papers/attempts/${a.id}`} size="sm">Resume</ButtonLink>
                </li>
              ))}
            </ul>
          )}
          {c.items.length > 0 && (
            <ul className="divide-y divide-line">
              {c.items.map((i) => (
                <li key={i.type + i.id}>
                  <Link to={href(i.type, i.id)} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                    <span className="truncate">{i.title}</span>
                    <span className="shrink-0 text-xs text-muted">{i.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {c.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.topics.map((t) => (
                <Link key={t.id} to={`/app/booklet/subjects/${t.subject.id}?topic=${t.id}`} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-line-strong hover:text-ink">
                  {t.subject.name} · {t.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function Weekly({ week }: { week: Dashboard["week"] }) {
  const data = week.map((d) => ({ ...d, day: new Date(d.date + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short" }) }));
  const totals = week.reduce((a, d) => ({ planned: a.planned + d.plannedMins, actual: a.actual + d.studyMins, attempts: a.attempts + d.attempts, revisions: a.revisions + d.revisions, done: a.done + d.completedSessions }), { planned: 0, actual: 0, attempts: 0, revisions: 0, done: 0 });
  const nothing = totals.planned + totals.actual + totals.attempts + totals.revisions === 0;
  return (
    <Section title="Last 7 days">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Planned" value={fmtMinutes(totals.planned)} />
        <StatTile label="Studied" value={fmtMinutes(totals.actual)} />
        <StatTile label="Questions" value={totals.attempts} />
        <StatTile label="Revisions" value={totals.revisions} />
        <StatTile label="Sessions done" value={totals.done} />
      </div>
      {nothing ? (
        <p className="py-6 text-center text-sm text-muted">Your weekly chart appears once you plan sessions, study or answer questions.</p>
      ) : (
        <div className="h-56" role="img" aria-label="Planned versus actual study minutes for each of the last 7 days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={32} tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v} min`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="plannedMins" name="Planned" fill="var(--line-strong)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="studyMins" name="Studied" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}
