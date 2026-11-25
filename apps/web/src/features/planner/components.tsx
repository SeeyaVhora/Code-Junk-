import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Circle, Clock, Pause, Play, PlayCircle } from "lucide-react";
import { PRIORITIES, RECURRENCES, sessionInput } from "@code-junk/shared";
import { Badge, Button, Dialog, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDay, fmtDuration, fmtMinutes, fmtTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { SubjectTopicPicker } from "@/features/subjects/components";
import { useGoals, useInvalidatePlanner, useSessionActions, type PlannerSession } from "./api";

/** Seconds studied, ticking live while the session's timer runs. */
export function useLiveElapsed(s: Pick<PlannerSession, "elapsedSecs" | "runningSince" | "status">) {
  const [now, setNow] = useState(Date.now());
  const loadedAt = useState(Date.now())[0];
  useEffect(() => {
    if (s.status !== "IN_PROGRESS") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s.status]);
  return s.status === "IN_PROGRESS" ? s.elapsedSecs + Math.round((now - loadedAt) / 1000) : s.elapsedSecs;
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "green" | "yellow" | "red"> = { SCHEDULED: "neutral", IN_PROGRESS: "accent", PAUSED: "yellow", COMPLETED: "green", CANCELLED: "neutral", SKIPPED: "neutral", RESCHEDULED: "neutral" };

export function SessionRow({ s, showDate }: { s: PlannerSession; showDate?: boolean }) {
  const act = useSessionActions();
  const elapsed = useLiveElapsed(s);
  const done = s.status === "COMPLETED";
  const closed = done || s.status === "CANCELLED";
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {done ? <CheckCircle2 className="size-5 text-mark-green" aria-label="Completed" /> : s.status === "IN_PROGRESS" ? <PlayCircle className="size-5 text-accent" aria-label="In progress" /> : <Circle className="size-5 text-line-strong" aria-label="Not done" />}
      <Link to={`/app/planner/sessions/${s.id}`} className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium hover:underline", closed && "text-muted", s.status === "CANCELLED" && "line-through")}>{s.subject ? `${s.subject.name}${s.topic ? ` — ${s.topic.name}` : ""}` : s.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{showDate ? `${fmtDay(s.startsAt)} ` : ""}{fmtTime(s.startsAt)}</span>
          <span>{fmtMinutes(s.plannedMins)} planned</span>
          {(elapsed > 0 || done) && <span>{done ? `${fmtMinutes(s.actualMins ?? 0)} studied` : `${fmtDuration(elapsed)} so far`}</span>}
          {s.goal && <span>· {s.goal.title}</span>}
          {s.isOverdue && <Badge tone="red" className="h-5">missed</Badge>}
          {s.status !== "SCHEDULED" && !s.isOverdue && <Badge tone={STATUS_TONE[s.status]} className="h-5">{s.status.toLowerCase().replace("_", " ")}</Badge>}
        </p>
      </Link>
      {!closed && (
        <div className="flex gap-1.5">
          {s.status === "IN_PROGRESS" ? (
            <Button size="sm" variant="secondary" leftIcon={<Pause />} onClick={() => act.mutate({ id: s.id, action: "pause" })}>Pause</Button>
          ) : (
            <Button size="sm" variant="secondary" leftIcon={<Play />} onClick={() => act.mutate({ id: s.id, action: "start" })}>{s.status === "PAUSED" ? "Resume" : "Start"}</Button>
          )}
          <Button size="sm" onClick={() => act.mutate({ id: s.id, action: "complete" })}>Complete</Button>
        </div>
      )}
    </li>
  );
}

/** Create a study session (optionally recurring). */
export function SessionDialog({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: { goalId?: string; subjectId?: string; startsAt?: string } }) {
  const toast = useToast();
  const invalidate = useInvalidatePlanner();
  const goals = useGoals();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const next = new Date(Date.now() + 3600_000);
  next.setMinutes(0, 0, 0);
  const [f, setF] = useState({ title: "", subjectId: defaults?.subjectId ?? "", topicId: "", goalId: defaults?.goalId ?? "", milestoneId: "", startsAt: toLocalInput(defaults?.startsAt ?? next), plannedMins: 45, priority: "MEDIUM", notes: "", recurrence: "NONE", repeatUntil: "" });
  const goal = goals.data?.find((g) => g.id === f.goalId);

  const save = async () => {
    const body = { ...f, title: f.title || "Study session", subjectId: f.subjectId || null, topicId: f.topicId || null, goalId: f.goalId || null, milestoneId: f.milestoneId || null, notes: f.notes || null, startsAt: f.startsAt ? fromLocalInput(f.startsAt) : "", repeatUntil: f.repeatUntil || null };
    const parsed = sessionInput.safeParse(body);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setBusy(true);
    try {
      const r = await api<{ created: number }>("/planner/sessions", { method: "POST", body: parsed.data });
      toast.success(r.created > 1 ? `${r.created} sessions scheduled.` : "Session scheduled.");
      invalidate();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Schedule a study session" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void save()}>Schedule</Button></>}>
      <div className="space-y-4">
        <Field label="What will you study?" hint="Leave blank to use the subject and topic." error={errors.title}>{(a) => <Input {...a} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Go: interfaces exercises" />}</Field>
        <SubjectTopicPicker subjectOptional subjectId={f.subjectId} topicId={f.topicId} onChange={(v) => setF({ ...f, subjectId: v.subjectId, topicId: v.topicId })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date and time" error={errors.startsAt}>{(a) => <Input {...a} type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />}</Field>
          <Field label="Duration (minutes)" error={errors.plannedMins}>{(a) => <Input {...a} type="number" min={5} max={720} step={5} value={f.plannedMins} onChange={(e) => setF({ ...f, plannedMins: Number(e.target.value) })} />}</Field>
          <Field label="Priority">{(a) => <Select {...a} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</Select>}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeat">{(a) => <Select {...a} value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}>{RECURRENCES.map((r) => <option key={r} value={r}>{{ NONE: "Does not repeat", DAILY: "Every day", WEEKDAYS: "Weekdays", WEEKLY: "Every week" }[r]}</option>)}</Select>}</Field>
          {f.recurrence !== "NONE" && <Field label="Repeat until" error={errors.repeatUntil}>{(a) => <Input {...a} type="date" value={f.repeatUntil} onChange={(e) => setF({ ...f, repeatUntil: e.target.value })} />}</Field>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal (optional)">{(a) => <Select {...a} value={f.goalId} onChange={(e) => setF({ ...f, goalId: e.target.value, milestoneId: "" })}><option value="">None</option>{goals.data?.filter((g) => g.status !== "COMPLETED").map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select>}</Field>
          {goal && goal.milestones.length > 0 && <Field label="Milestone (optional)" hint="Completing the session ticks it off.">{(a) => <Select {...a} value={f.milestoneId} onChange={(e) => setF({ ...f, milestoneId: e.target.value })}><option value="">None</option>{goal.milestones.filter((m) => !m.completedAt).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>}</Field>}
        </div>
        <Field label="Notes (optional)">{(a) => <Textarea {...a} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-16" />}</Field>
      </div>
    </Dialog>
  );
}
