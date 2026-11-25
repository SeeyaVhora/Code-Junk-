import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Plus, Target, Trash2 } from "lucide-react";
import { PRIORITIES, goalInput } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, QueryView, Section, Select, StatTile, TabLinks, Textarea, useConfirm, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMinutes } from "@/lib/format";
import { SubjectTopicPicker } from "@/features/subjects/components";
import { useGoals, useInvalidatePlanner, useOverview, type Goal, type PlannerSession } from "./api";
import { SessionDialog, SessionRow } from "./components";

export function PlannerTabs({ action }: { action?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Learning Planner" description="Decide what to learn and when. Sessions appear on your calendar and Home." actions={action} />
      <TabLinks className="mb-6" tabs={[{ to: "/app/planner", label: "Overview", end: true }, { to: "/app/planner/goals", label: "Goals" }, { to: "/app/planner/day", label: "Daily plan" }, { to: "/app/planner/week", label: "Weekly plan" }, { to: "/app/planner/focus", label: "Focus timer" }]} />
    </>
  );
}

function NewSessionButton() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "session");
  useEffect(() => {
    if (params.get("new") === "session") setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Button leftIcon={<Plus />} onClick={() => setOpen(true)}>Schedule session</Button>
      {open && <SessionDialog open onClose={() => setOpen(false)} />}
    </>
  );
}

function SessionList({ sessions, empty, showDate }: { sessions: PlannerSession[]; empty: string; showDate?: boolean }) {
  if (!sessions.length) return <p className="py-3 text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-line">{sessions.map((s) => <SessionRow key={s.id} s={s} showDate={showDate} />)}</ul>;
}

export function GoalProgress({ g }: { g: Goal }) {
  const pct = g.progress.pct;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>{g.progress.basis === "milestones" ? `${g.progress.done}/${g.progress.total} milestones` : g.progress.basis === "sessions" ? `${g.progress.done}/${g.progress.total} sessions` : "Add milestones or sessions to track progress"}</span>
        {pct !== null && <span className="font-mono">{pct}%</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct ?? 0}%` }} /></div>
    </div>
  );
}

export function PlannerOverviewPage() {
  const q = useOverview();
  return (
    <div>
      <PlannerTabs action={<NewSessionButton />} />
      <QueryView query={q}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Today" value={`${d.today.length} session${d.today.length === 1 ? "" : "s"}`} />
              <StatTile label="Planned this week" value={fmtMinutes(d.week.plannedMins)} />
              <StatTile label="Studied this week" value={fmtMinutes(d.week.actualMins)} hint={d.week.plannedMins ? `${Math.round((d.week.actualMins / d.week.plannedMins) * 100)}% of plan` : undefined} />
              <StatTile label="Active goals" value={d.activeGoals.length} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Today's plan"><SessionList sessions={d.today} empty="Nothing scheduled today." /></Section>
              <Section title="Overdue" action={d.overdue.length ? <Badge tone="red">{d.overdue.length}</Badge> : undefined}><SessionList sessions={d.overdue} empty="No overdue sessions. 👏" showDate /></Section>
              <Section title="Upcoming"><SessionList sessions={d.upcoming} empty="No upcoming sessions scheduled." showDate /></Section>
              <Section title="Active goals" action={<Link to="/app/planner/goals" className="text-xs text-ink-2 hover:text-ink">All goals →</Link>}>
                {d.activeGoals.length === 0 ? (
                  <EmptyState icon={<Target />} title="No active goals" description="Set a goal like “Finish DSA arrays” and track it with milestones." action={<ButtonLink to="/app/planner/goals?new=1" size="sm" leftIcon={<Plus />}>New goal</ButtonLink>} className="py-6" />
                ) : (
                  <ul className="space-y-4">{d.activeGoals.map((g) => <li key={g.id}><Link to={`/app/planner/goals/${g.id}`} className="text-sm font-medium hover:underline">{g.title}</Link>{g.targetDate && <span className="ml-2 text-xs text-muted">by {fmtDate(g.targetDate)}</span>}<div className="mt-1.5"><GoalProgress g={g} /></div></li>)}</ul>
                )}
              </Section>
            </div>
            {d.completedGoals.length > 0 && (
              <Section title={`Completed goals (${d.completedGoals.length})`}>
                <ul className="space-y-1.5">{d.completedGoals.map((g) => <li key={g.id} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-mark-green" /><Link to={`/app/planner/goals/${g.id}`} className="hover:underline">{g.title}</Link>{g.completedAt && <span className="text-xs text-muted">{fmtDate(g.completedAt)}</span>}</li>)}</ul>
              </Section>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function GoalDialog({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidatePlanner();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: goal?.title ?? "", description: goal?.description ?? "", subjectId: goal?.subject?.id ?? "", topicId: goal?.topic?.id ?? "", priority: goal?.priority ?? "MEDIUM", targetDate: goal?.targetDate?.slice(0, 10) ?? "", estimatedMins: goal?.estimatedMins ?? "", milestones: [] as string[], milestoneDraft: "" });

  const save = async () => {
    const body = { title: f.title, description: f.description || null, subjectId: f.subjectId || null, topicId: f.topicId || null, priority: f.priority, targetDate: f.targetDate || null, estimatedMins: f.estimatedMins === "" ? null : Number(f.estimatedMins), milestones: [...f.milestones, ...(f.milestoneDraft.trim() ? [f.milestoneDraft.trim()] : [])] };
    const parsed = goalInput.safeParse(body);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setBusy(true);
    try {
      if (goal) {
        const { milestones: _m, ...rest } = parsed.data;
        await api(`/planner/goals/${goal.id}`, { method: "PATCH", body: rest });
        toast.success("Goal updated.");
      } else {
        const r = await api<{ goal: Goal }>("/planner/goals", { method: "POST", body: parsed.data });
        toast.success("Goal created.");
        navigate(`/app/planner/goals/${r.goal.id}`);
      }
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
    <Dialog open onClose={onClose} title={goal ? "Edit goal" : "New learning goal"} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void save()}>{goal ? "Save" : "Create goal"}</Button></>}>
      <div className="space-y-4">
        <Field label="Goal" error={errors.title}>{(a) => <Input {...a} autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Complete Go Module 1" />}</Field>
        <SubjectTopicPicker subjectOptional subjectId={f.subjectId} topicId={f.topicId} onChange={(v) => setF({ ...f, subjectId: v.subjectId, topicId: v.topicId })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Priority">{(a) => <Select {...a} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</Select>}</Field>
          <Field label="Target date" hint="Shown on your calendar." error={errors.targetDate}>{(a) => <Input {...a} type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />}</Field>
          <Field label="Estimated time (min)">{(a) => <Input {...a} type="number" min={0} value={f.estimatedMins} onChange={(e) => setF({ ...f, estimatedMins: e.target.value })} />}</Field>
        </div>
        <Field label="Description (optional)">{(a) => <Textarea {...a} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-16" />}</Field>
        {!goal && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Milestones <span className="font-normal text-muted">(progress is measured by these)</span></p>
            <ul className="mb-2 space-y-1">{f.milestones.map((m, i) => <li key={i} className="flex items-center justify-between rounded border border-line px-2.5 py-1.5 text-sm">{m}<button type="button" aria-label={`Remove ${m}`} onClick={() => setF({ ...f, milestones: f.milestones.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><Trash2 className="size-3.5" /></button></li>)}</ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (f.milestoneDraft.trim()) setF({ ...f, milestones: [...f.milestones, f.milestoneDraft.trim()], milestoneDraft: "" }); }}>
              <Input value={f.milestoneDraft} onChange={(e) => setF({ ...f, milestoneDraft: e.target.value })} placeholder="e.g. Variables and data types" aria-label="New milestone" />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function GoalsPage() {
  const q = useGoals();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new")) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <PlannerTabs action={<Button leftIcon={<Plus />} onClick={() => setOpen(true)}>New goal</Button>} />
      <QueryView query={q}>
        {(goals) =>
          goals.length === 0 ? (
            <EmptyState icon={<Target />} title="No learning goals yet" description="Goals give your study sessions a purpose. Break them into milestones to track real progress." action={<Button leftIcon={<Plus />} onClick={() => setOpen(true)}>Create a goal</Button>} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {goals.map((g) => (
                <li key={g.id}>
                  <Link to={`/app/planner/goals/${g.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                    <div className="flex items-start justify-between gap-2"><p className={cn("font-medium", g.status === "COMPLETED" && "text-muted line-through")}>{g.title}</p><Badge tone={g.status === "COMPLETED" ? "green" : g.status === "IN_PROGRESS" ? "accent" : "neutral"}>{g.status.toLowerCase().replace("_", " ")}</Badge></div>
                    <p className="mt-0.5 text-xs text-muted">{[g.subject?.name, g.targetDate && `by ${fmtDate(g.targetDate)}`, g.priority !== "MEDIUM" && `${g.priority.toLowerCase()} priority`].filter(Boolean).join(" · ") || "No subject"}</p>
                    <div className="mt-3"><GoalProgress g={g} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      {open && <GoalDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

export function GoalDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["planner", "goal", id], queryFn: async () => (await api<{ goal: Goal & { sessions: PlannerSession[] } }>(`/planner/goals/${id}`)).goal });
  const invalidate = useInvalidatePlanner();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [draft, setDraft] = useState("");
  const call = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body?: object }) => api(path, { method, body }), onSuccess: invalidate, onError: toast.error });

  return (
    <QueryView query={q}>
      {(g) => (
        <div>
          <PageHeader
            eyebrow={<Link to="/app/planner/goals" className="hover:text-ink">← Goals</Link>}
            title={g.title}
            description={g.description ?? undefined}
            actions={
              <>
                {g.status !== "COMPLETED" ? <Button leftIcon={<CheckCircle2 />} onClick={() => call.mutate({ path: `/planner/goals/${g.id}`, method: "PATCH", body: { status: "COMPLETED" } }, { onSuccess: () => toast.success("Goal completed! 🎉") })}>Mark complete</Button> : <Button variant="secondary" onClick={() => call.mutate({ path: `/planner/goals/${g.id}`, method: "PATCH", body: { status: "IN_PROGRESS" } })}>Reopen</Button>}
                <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="ghost" size="icon" aria-label="Delete goal" onClick={async () => { if (await confirm({ title: "Delete this goal?", body: "Its milestones are deleted. Linked study sessions are kept.", danger: true, confirmLabel: "Delete" })) call.mutate({ path: `/planner/goals/${g.id}`, method: "DELETE" }, { onSuccess: () => navigate("/app/planner/goals") }); }}><Trash2 /></Button>
              </>
            }
          />
          <div className="mb-5 max-w-xl"><GoalProgress g={g} /></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Milestones">
              <ul className="mb-3 space-y-1">
                {g.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-1">
                    <Checkbox checked={!!m.completedAt} onChange={(e) => call.mutate({ path: `/planner/milestones/${m.id}`, method: "PATCH", body: { done: e.target.checked } })} label={<span className={cn(m.completedAt && "text-muted line-through")}>{m.title}</span>} className="flex-1" />
                    <button type="button" aria-label={`Delete ${m.title}`} onClick={() => call.mutate({ path: `/planner/milestones/${m.id}`, method: "DELETE" })} className="text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) call.mutate({ path: `/planner/goals/${g.id}/milestones`, method: "POST", body: { title: draft.trim() } }, { onSuccess: () => setDraft("") }); }}>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" />
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </Section>
            <Section title="Study sessions" action={<Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setScheduling(true)}>Schedule</Button>}>
              {g.sessions.length === 0 ? <p className="text-sm text-muted">No sessions linked yet.</p> : <ul className="divide-y divide-line">{g.sessions.map((s) => <SessionRow key={s.id} s={s} showDate />)}</ul>}
            </Section>
          </div>
          {editing && <GoalDialog goal={g} onClose={() => setEditing(false)} />}
          {scheduling && <SessionDialog open onClose={() => setScheduling(false)} defaults={{ goalId: g.id, subjectId: g.subject?.id }} />}
        </div>
      )}
    </QueryView>
  );
}
