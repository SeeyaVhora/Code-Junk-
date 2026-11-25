import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Square, Trash2, X } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, QueryView, Section, StatTile, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtDay, fmtDuration, fmtLongDay, fmtMinutes, fromLocalInput, toLocalInput } from "@/lib/format";
import { useSubjects } from "@/features/subjects/api";
import { useInvalidatePlanner, useSessionActions, type PlannerSession } from "./api";
import { SessionRow, useLiveElapsed } from "./components";
import { PlannerTabs } from "./PlannerPages";

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const useSessions = (from: Date, to: Date) =>
  useQuery({ queryKey: ["planner", "sessions", from.toISOString(), to.toISOString()], queryFn: async () => (await api<{ sessions: PlannerSession[] }>(`/planner/sessions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).sessions });

function Stepper({ label, onPrev, onNext, onToday }: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button size="icon-sm" variant="secondary" aria-label="Previous" onClick={onPrev}><ChevronLeft /></Button>
      <Button size="icon-sm" variant="secondary" aria-label="Next" onClick={onNext}><ChevronRight /></Button>
      <Button size="sm" variant="ghost" onClick={onToday}>Today</Button>
      <p className="ml-2 text-sm font-medium">{label}</p>
    </div>
  );
}

function totals(sessions: PlannerSession[]) {
  const live = sessions.filter((s) => s.status !== "CANCELLED");
  return {
    planned: live.reduce((a, s) => a + s.plannedMins, 0),
    actual: live.filter((s) => s.status === "COMPLETED").reduce((a, s) => a + (s.actualMins ?? 0), 0),
    done: live.filter((s) => s.status === "COMPLETED").length,
    pending: live.filter((s) => s.status !== "COMPLETED").length,
  };
}

export function DayPlanPage() {
  const [day, setDay] = useState(dayStart(new Date()));
  const q = useSessions(day, addDays(day, 1));
  return (
    <div>
      <PlannerTabs />
      <Stepper label={fmtLongDay(day)} onPrev={() => setDay(addDays(day, -1))} onNext={() => setDay(addDays(day, 1))} onToday={() => setDay(dayStart(new Date()))} />
      <QueryView query={q}>
        {(sessions) => {
          const t = totals(sessions);
          return (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><StatTile label="Planned" value={fmtMinutes(t.planned)} /><StatTile label="Studied" value={fmtMinutes(t.actual)} /><StatTile label="Completed" value={t.done} /><StatTile label="Pending" value={t.pending} /></div>
              <Section title="Sessions">{sessions.length ? <ul className="divide-y divide-line">{sessions.map((s) => <SessionRow key={s.id} s={s} />)}</ul> : <p className="py-3 text-sm text-muted">No sessions on this day. <Link to="/app/planner?new=session" className="text-accent hover:underline">Schedule one</Link></p>}</Section>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

export function WeekPlanPage() {
  const monday = (d: Date) => addDays(dayStart(d), -((d.getDay() + 6) % 7));
  const [start, setStart] = useState(monday(new Date()));
  const q = useSessions(start, addDays(start, 7));
  return (
    <div>
      <PlannerTabs />
      <Stepper label={`${fmtDay(start)} – ${fmtDay(addDays(start, 6))}`} onPrev={() => setStart(addDays(start, -7))} onNext={() => setStart(addDays(start, 7))} onToday={() => setStart(monday(new Date()))} />
      <QueryView query={q}>
        {(sessions) => {
          const t = totals(sessions);
          return (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><StatTile label="Planned" value={fmtMinutes(t.planned)} /><StatTile label="Studied" value={fmtMinutes(t.actual)} hint={t.planned ? `${Math.round((t.actual / t.planned) * 100)}% of plan` : undefined} /><StatTile label="Completed" value={t.done} /><StatTile label="Pending" value={t.pending} /></div>
              <div className="space-y-3">
                {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
                  const list = sessions.filter((s) => dayStart(new Date(s.startsAt)).getTime() === d.getTime());
                  return (
                    <Section key={d.toISOString()} title={fmtLongDay(d)} action={<span className="text-xs text-muted">{fmtMinutes(list.reduce((a, s) => a + s.plannedMins, 0))}</span>}>
                      {list.length ? <ul className="divide-y divide-line">{list.map((s) => <SessionRow key={s.id} s={s} />)}</ul> : <p className="text-sm text-muted">Free.</p>}
                    </Section>
                  );
                })}
              </div>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

export function SessionDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["planner", "session", id], queryFn: async () => (await api<{ session: PlannerSession }>(`/planner/sessions/${id}`)).session });
  return <QueryView query={q}>{(s) => <SessionDetail s={s} />}</QueryView>;
}

function SessionDetail({ s }: { s: PlannerSession }) {
  const act = useSessionActions();
  const invalidate = useInvalidatePlanner();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const elapsed = useLiveElapsed(s);
  const [resched, setResched] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const del = useMutation({ mutationFn: (series: boolean) => api(`/planner/sessions/${s.id}${series ? "?series=future" : ""}`, { method: "DELETE" }), onSuccess: () => { invalidate(); toast.success("Deleted."); navigate("/app/planner"); }, onError: toast.error });
  const closed = s.status === "COMPLETED" || s.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/app/planner" className="mb-3 inline-flex text-sm text-ink-2 hover:text-ink">← Planner</Link>
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{s.title}</h1>
            <p className="mt-1 text-sm text-ink-2">{[s.subject?.name, s.topic?.name].filter(Boolean).join(" · ") || "No subject"}</p>
            <p className="mt-1 text-xs text-muted">{fmtDateTime(s.startsAt)} · {fmtMinutes(s.plannedMins)} planned{s.goal ? ` · goal: ${s.goal.title}` : ""}{s.milestone ? ` · milestone: ${s.milestone.title}` : ""}</p>
          </div>
          <Badge tone={s.status === "COMPLETED" ? "green" : s.status === "IN_PROGRESS" ? "accent" : s.isOverdue ? "red" : "neutral"}>{s.isOverdue ? "missed" : s.status.toLowerCase().replace("_", " ")}</Badge>
        </div>
        <p className="my-8 text-center font-mono text-5xl font-semibold tracking-tight tabular-nums" aria-live="off">{fmtDuration(s.status === "COMPLETED" ? (s.actualMins ?? 0) * 60 : elapsed)}</p>
        {!closed ? (
          <div className="flex flex-wrap justify-center gap-2">
            {s.status === "IN_PROGRESS" ? <Button size="lg" variant="secondary" leftIcon={<Pause />} onClick={() => act.mutate({ id: s.id, action: "pause" })}>Pause</Button> : <Button size="lg" leftIcon={<Play />} onClick={() => act.mutate({ id: s.id, action: "start" })}>{s.status === "PAUSED" ? "Resume" : "Start"}</Button>}
            <Button size="lg" variant={s.status === "IN_PROGRESS" ? "primary" : "secondary"} leftIcon={<Square />} disabled={elapsed === 0} onClick={() => act.mutate({ id: s.id, action: "complete" })}>Complete</Button>
            <Button size="lg" variant="ghost" onClick={() => setManual(String(s.plannedMins))}>Log time manually</Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">{s.status === "COMPLETED" ? `Completed — ${fmtMinutes(s.actualMins ?? 0)} studied.` : "This session was cancelled."}</p>
        )}
        {s.notes && <p className="mt-6 rounded-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">{s.notes}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2 border-t border-line pt-4">
          {!closed && <Button size="sm" variant="secondary" leftIcon={<CalendarClock />} onClick={() => setResched(toLocalInput(new Date(Date.now() + 86_400_000)))}>Reschedule</Button>}
          {!closed && <Button size="sm" variant="secondary" leftIcon={<X />} onClick={async () => { if (await confirm({ title: "Cancel this session?", confirmLabel: "Cancel session" })) act.mutate({ id: s.id, action: "cancel" }); }}>Cancel session</Button>}
          <Button size="sm" variant="ghost" leftIcon={<Trash2 />} onClick={async () => { if (await confirm({ title: "Delete this session?", body: s.seriesId ? "This is part of a repeating series. Only this session is deleted." : undefined, danger: true, confirmLabel: "Delete" })) del.mutate(false); }}>Delete</Button>
          {s.seriesId && !closed && <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: "Delete this and future sessions?", body: "Completed sessions in the series are kept.", danger: true, confirmLabel: "Delete series" })) del.mutate(true); }}>Delete this & future</Button>}
        </div>
      </div>
      <Dialog open={resched !== null} onClose={() => setResched(null)} title="Reschedule" size="sm" footer={<><Button variant="secondary" onClick={() => setResched(null)}>Cancel</Button><Button disabled={!resched} loading={act.isPending} onClick={() => act.mutate({ id: s.id, action: "reschedule", body: { startsAt: fromLocalInput(resched!) } }, { onSuccess: () => setResched(null) })}>Save</Button></>}>
        <Field label="New date and time">{(a) => <Input {...a} type="datetime-local" value={resched ?? ""} onChange={(e) => setResched(e.target.value)} />}</Field>
      </Dialog>
      <Dialog open={manual !== null} onClose={() => setManual(null)} title="Log study time" size="sm" footer={<><Button variant="secondary" onClick={() => setManual(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ id: s.id, action: "complete", body: { actualMins: Number(manual) } }, { onSuccess: () => setManual(null) })}>Complete session</Button></>}>
        <Field label="Minutes actually studied">{(a) => <Input {...a} type="number" min={0} max={1440} value={manual ?? ""} onChange={(e) => setManual(e.target.value)} />}</Field>
      </Dialog>
    </div>
  );
}

/** Standalone focus timer. Only completed focus stretches are saved, counting toward study time. */
export function FocusPage() {
  const subjects = useSubjects();
  const toast = useToast();
  const invalidate = useInvalidatePlanner();
  const recent = useQuery({ queryKey: ["planner", "focus"], queryFn: () => api<{ todaySecs: number; todayCount: number; recent: { id: string; label: string | null; durationSecs: number; endedAt: string; subject: { name: string } | null }[] }>("/planner/focus") });
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [state, setState] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<Date | null>(null);
  const tickFrom = useRef<number>(0);
  const base = useRef(0);
  const total = minutes * 60;
  const left = Math.max(0, total - elapsed);

  useEffect(() => {
    if (state !== "running") return;
    const t = setInterval(() => {
      const e = base.current + Math.round((Date.now() - tickFrom.current) / 1000);
      setElapsed(e);
      if (e >= total) setState("done");
    }, 500);
    return () => clearInterval(t);
  }, [state, total]);

  const save = useMutation({
    mutationFn: (secs: number) => api("/planner/focus", { method: "POST", body: { startedAt: new Date(Date.now() - secs * 1000).toISOString(), endedAt: new Date().toISOString(), label: label || null, subjectId: subjectId || null } }),
    onSuccess: () => { toast.success("Focus session saved."); invalidate(); void recent.refetch(); },
    onError: toast.error,
  });
  useEffect(() => {
    if (state === "done") save.mutate(total);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { startedAt.current ??= new Date(); tickFrom.current = Date.now(); setState("running"); };
  const pause = () => { base.current = elapsed; setState("paused"); };
  const reset = () => { base.current = 0; startedAt.current = null; setElapsed(0); setState("idle"); };
  const finishEarly = () => { if (elapsed >= 60) save.mutate(elapsed); reset(); };

  return (
    <div>
      <PlannerTabs />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <p className="font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl" role="timer" aria-label={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>{fmtDuration(left)}</p>
          <div className="mx-auto mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent transition-[width]" style={{ width: `${(elapsed / total) * 100}%` }} /></div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {state === "running" ? <Button size="lg" variant="secondary" leftIcon={<Pause />} onClick={pause}>Pause</Button> : <Button size="lg" leftIcon={<Play />} onClick={state === "done" ? reset : start}>{state === "paused" ? "Resume" : state === "done" ? "New session" : "Start"}</Button>}
            {(state === "running" || state === "paused") && <Button size="lg" variant="secondary" leftIcon={<Square />} onClick={finishEarly}>Finish & save</Button>}
            <Button size="lg" variant="ghost" leftIcon={<RotateCcw />} onClick={reset} disabled={state === "idle"}>Reset</Button>
          </div>
          {state === "idle" && (
            <div className="mx-auto mt-6 grid max-w-md gap-3 text-left sm:grid-cols-2">
              <Field label="Minutes">{(a) => <Input {...a} type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} />}</Field>
              <Field label="Subject (optional)">{(a) => <select {...a} className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">None</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</Field>
              <Field label="Label (optional)" className="sm:col-span-2">{(a) => <Input {...a} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What are you focusing on?" />}</Field>
            </div>
          )}
          {state === "done" && <p className="mt-4 text-sm text-mark-green">Done! {minutes} minutes of focus saved.</p>}
        </div>
        <Section title="Focus today">
          <QueryView query={recent}>
            {(r) => (
              <>
                <p className="text-2xl font-semibold">{fmtMinutes(Math.round(r.todaySecs / 60))}</p>
                <p className="mb-4 text-xs text-muted">{r.todayCount} session{r.todayCount === 1 ? "" : "s"} today</p>
                <ul className="divide-y divide-line">{r.recent.map((f) => <li key={f.id} className="flex justify-between py-2 text-sm"><span className="truncate">{f.label ?? f.subject?.name ?? "Focus"}</span><span className="text-xs text-muted">{fmtMinutes(Math.round(f.durationSecs / 60))} · {fmtDay(f.endedAt)}</span></li>)}</ul>
              </>
            )}
          </QueryView>
        </Section>
      </div>
    </div>
  );
}
