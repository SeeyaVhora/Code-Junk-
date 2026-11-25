import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { EVENT_CATEGORY_LABEL, type EventCategory } from "@code-junk/shared";
import { Badge, Button, Chip, Dialog, EmptyState, LoadingBlock, PageHeader, Segmented, ErrorState, errorMessage, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtDay, fmtLongDay, fmtMinutes, fmtTime, relative } from "@/lib/format";
import { EventDialog, type CalEvent } from "./EventDialog";

type Cat = EventCategory | "LEARNING_SESSION";
interface CalSession { id: string; title: string; startsAt: string; plannedMins: number; status: string; subject: { name: string } | null; topic: { name: string } | null }
interface Item { id: string; cat: Cat; title: string; start: Date; end: Date | null; allDay: boolean; done: boolean; overdue: boolean; event?: CalEvent; session?: CalSession }

const CAT_STYLE: Record<Cat, { dot: string; chip: string }> = {
  EXAMINATION: { dot: "bg-cat-exam", chip: "border-l-cat-exam" },
  ASSIGNMENT: { dot: "bg-cat-assignment", chip: "border-l-cat-assignment" },
  COLLEGE_EVENT: { dot: "bg-cat-college", chip: "border-l-cat-college" },
  LEARNING_DEADLINE: { dot: "bg-cat-deadline", chip: "border-l-cat-deadline" },
  PERSONAL: { dot: "bg-cat-personal", chip: "border-l-cat-personal" },
  LEARNING_SESSION: { dot: "bg-accent", chip: "border-l-accent" },
};
const ALL_CATS: Cat[] = ["EXAMINATION", "ASSIGNMENT", "COLLEGE_EVENT", "LEARNING_SESSION", "LEARNING_DEADLINE", "PERSONAL"];

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a: Date, b: Date) => day0(a).getTime() === day0(b).getTime();
const tomorrowAt9 = () => { const d = add(day0(new Date()), 1); d.setHours(9); return d; };
const mondayOf = (d: Date) => add(day0(d), -((d.getDay() + 6) % 7));

type View = "month" | "week" | "day" | "agenda";

function range(view: View, cursor: Date) {
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    return { start, end: add(start, 42) };
  }
  if (view === "week") return { start: mondayOf(cursor), end: add(mondayOf(cursor), 7) };
  if (view === "day") return { start: day0(cursor), end: add(day0(cursor), 1) };
  return { start: day0(cursor), end: add(day0(cursor), 60) };
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => (window.innerWidth < 640 ? "agenda" : "month"));
  const [cursor, setCursor] = useState(day0(new Date()));
  const [cats, setCats] = useState<Set<Cat>>(new Set(ALL_CATS));
  const [creating, setCreating] = useState<Date | null>(params.get("new") ? tomorrowAt9() : null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const openId = params.get("event");
  useEffect(() => {
    if (params.get("new")) {
      const n = new URLSearchParams(params);
      n.delete("new");
      setParams(n, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { start, end } = range(view, cursor);
  const q = useQuery({
    queryKey: ["calendar", start.toISOString(), end.toISOString()],
    queryFn: () => api<{ events: CalEvent[]; sessions: CalSession[] }>(`/calendar?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`),
  });
  const detail = useQuery({ queryKey: ["calendar", "event", openId], enabled: !!openId, queryFn: async () => (await api<{ event: CalEvent }>(`/calendar/${openId}`)).event });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(`/calendar/${id}`, { method: "PATCH", body }), onSuccess: refresh, onError: toast.error });
  const remove = useMutation({ mutationFn: (id: string) => api(`/calendar/${id}`, { method: "DELETE" }), onSuccess: () => { refresh(); closeDetail(); toast.success("Event deleted."); }, onError: toast.error });
  const closeDetail = () => { const n = new URLSearchParams(params); n.delete("event"); setParams(n, { replace: true }); };
  const openEvent = (id: string) => { const n = new URLSearchParams(params); n.set("event", id); setParams(n, { replace: true }); };

  const items: Item[] = useMemo(() => {
    if (!q.data) return [];
    const ev: Item[] = q.data.events.map((e) => ({ id: e.id, cat: e.category, title: e.title, start: new Date(e.startsAt), end: e.endsAt ? new Date(e.endsAt) : null, allDay: e.allDay, done: !!e.completedAt || ["SUBMITTED", "GRADED", "COMPLETED"].includes(e.assignment?.submissionStatus ?? ""), overdue: e.overdue, event: e }));
    const ss: Item[] = q.data.sessions.map((s) => ({ id: s.id, cat: "LEARNING_SESSION", title: s.subject ? `${s.subject.name}${s.topic ? ` — ${s.topic.name}` : ""}` : s.title, start: new Date(s.startsAt), end: new Date(new Date(s.startsAt).getTime() + s.plannedMins * 60_000), allDay: false, done: s.status === "COMPLETED", overdue: false, session: s }));
    return [...ev, ...ss].filter((i) => cats.has(i.cat)).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [q.data, cats]);

  const onItem = (i: Item) => (i.session ? navigate(`/app/planner/sessions/${i.session.id}`) : openEvent(i.id));

  /** Drag an event to another day in month view: keeps its time of day. */
  const drop = (target: Date, payload: string) => {
    const i = items.find((x) => x.id === payload && x.event);
    if (!i?.event || same(i.start, target)) return;
    const shift = day0(target).getTime() - day0(i.start).getTime();
    patch.mutate({ id: i.id, body: { startsAt: new Date(i.start.getTime() + shift).toISOString(), ...(i.end ? { endsAt: new Date(i.end.getTime() + shift).toISOString() } : {}) } }, { onSuccess: () => toast.success(`Moved to ${fmtDay(target)}.`) });
  };

  const step = (dir: -1 | 1) => setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1) : view === "week" ? add(cursor, 7 * dir) : view === "day" ? add(cursor, dir) : add(cursor, 30 * dir));
  const label = view === "month" ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : view === "week" ? `${fmtDay(mondayOf(cursor))} – ${fmtDay(add(mondayOf(cursor), 6))}` : view === "day" ? fmtLongDay(cursor) : `From ${fmtDay(cursor)}`;

  const Pill = ({ i, compact }: { i: Item; compact?: boolean }) => (
    <button
      type="button"
      draggable={!!i.event && view === "month"}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
      onClick={(e) => { e.stopPropagation(); onItem(i); }}
      className={cn("flex w-full items-center gap-1.5 truncate rounded border-l-2 bg-surface-2 px-1.5 py-0.5 text-left text-[11.5px] hover:bg-surface-3", CAT_STYLE[i.cat].chip, i.done && "text-muted line-through", i.overdue && "text-mark-red")}
      title={`${EVENT_CATEGORY_LABEL[i.cat]}: ${i.title}`}
    >
      {!compact && !i.allDay && <span className="shrink-0 font-mono text-[10px] text-muted">{fmtTime(i.start)}</span>}
      <span className="truncate">{i.title}</span>
    </button>
  );

  return (
    <div>
      <PageHeader title="Calendar" description="Exams, assignments, college events, personal plans and your study sessions in one place." actions={<Button leftIcon={<Plus />} onClick={() => setCreating(tomorrowAt9())}>Add event</Button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="secondary" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button size="icon-sm" variant="secondary" aria-label="Next" onClick={() => step(1)}><ChevronRight /></Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(day0(new Date()))}>Today</Button>
          <h2 className="ml-1 text-base font-semibold">{label}</h2>
        </div>
        <Segmented ariaLabel="Calendar view" value={view} onChange={setView} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }, { value: "agenda", label: "Agenda" }]} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter by type">
        {ALL_CATS.map((c) => (
          <Chip key={c} selected={cats.has(c)} onClick={() => setCats((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })}>
            <span className={cn("size-2 rounded-full", CAT_STYLE[c].dot)} />{EVENT_CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>

      {q.isPending ? <LoadingBlock /> : q.isError ? <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : view === "month" ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/50 text-center text-[11px] font-medium text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => add(start, i)).map((d) => {
              const list = items.filter((i) => same(i.start, d));
              const other = d.getMonth() !== cursor.getMonth();
              return (
                <div
                  key={d.toISOString()}
                  role="button"
                  tabIndex={0}
                  aria-label={`${fmtLongDay(d)}, ${list.length} item${list.length === 1 ? "" : "s"}. Add event`}
                  onClick={() => { const at = new Date(d); at.setHours(9); setCreating(at); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { const at = new Date(d); at.setHours(9); setCreating(at); } }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); drop(d, e.dataTransfer.getData("text/plain")); }}
                  className={cn("min-h-24 cursor-pointer border-r border-b border-line p-1 last:border-r-0 hover:bg-surface-2/40 sm:min-h-28 [&:nth-child(7n)]:border-r-0", other && "bg-paper/60")}
                >
                  <p className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", same(d, new Date()) ? "bg-ink font-semibold text-on-ink" : other ? "text-muted" : "text-ink-2")}>{d.getDate()}</p>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((i) => <Pill key={i.id} i={i} compact />)}
                    {list.length > 3 && <button type="button" onClick={(e) => { e.stopPropagation(); setCursor(d); setView("day"); }} className="px-1 text-[11px] text-ink-2 hover:text-ink">+{list.length - 3} more</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "week" ? (
        <div className="grid gap-2 sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => add(start, i)).map((d) => {
            const list = items.filter((i) => same(i.start, d));
            return (
              <div key={d.toISOString()} className="min-h-40 rounded-lg border border-line bg-surface p-2">
                <button type="button" onClick={() => { setCursor(d); setView("day"); }} className={cn("mb-2 text-left text-xs font-medium", same(d, new Date()) ? "text-accent" : "text-ink-2")}>{fmtDay(d)}</button>
                <div className="space-y-1">{list.map((i) => <Pill key={i.id} i={i} />)}</div>
                <button type="button" onClick={() => { const at = new Date(d); at.setHours(9); setCreating(at); }} className="mt-2 text-[11px] text-muted hover:text-ink">+ add</button>
              </div>
            );
          })}
        </div>
      ) : (
        <AgendaList items={items} days={view === "day" ? [cursor] : null} onItem={onItem} onAdd={(d) => { const at = new Date(d); at.setHours(9); setCreating(at); }} />
      )}

      {creating && <EventDialog defaultDate={creating} onClose={() => setCreating(null)} onSaved={refresh} />}
      {editing && <EventDialog event={editing} onClose={() => setEditing(null)} onSaved={() => { refresh(); void detail.refetch(); }} />}
      <Dialog open={!!openId && !editing} onClose={closeDetail} title={detail.data?.title ?? "Event"} size="md" footer={detail.data && (
        <>
          <Button variant="ghost" leftIcon={<Trash2 />} onClick={async () => { if (await confirm({ title: `Delete “${detail.data!.title}”?`, danger: true, confirmLabel: "Delete" })) remove.mutate(detail.data!.id); }}>Delete</Button>
          <Button variant="secondary" leftIcon={<Pencil />} onClick={() => setEditing(detail.data!)}>Edit</Button>
          {detail.data.assignment && !["SUBMITTED", "GRADED"].includes(detail.data.assignment.submissionStatus) && <Button leftIcon={<CheckCircle2 />} loading={patch.isPending} onClick={() => patch.mutate({ id: detail.data!.id, body: { submissionStatus: "SUBMITTED" } }, { onSuccess: () => { toast.success("Marked as submitted."); void detail.refetch(); } })}>Mark submitted</Button>}
          {detail.data.category === "EXAMINATION" && !detail.data.completedAt && <Button leftIcon={<CheckCircle2 />} loading={patch.isPending} onClick={() => patch.mutate({ id: detail.data!.id, body: { completed: true } }, { onSuccess: () => { toast.success("Exam marked as completed."); void detail.refetch(); } })}>Mark completed</Button>}
        </>
      )}>
        {detail.isPending ? <LoadingBlock rows={2} /> : detail.isError ? <p className="text-sm text-danger">This event couldn't be loaded. It may have been deleted.</p> : <EventDetails e={detail.data} />}
      </Dialog>
    </div>
  );
}

function EventDetails({ e }: { e: CalEvent }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge tone="outline"><span className={cn("size-2 rounded-full", CAT_STYLE[e.category].dot)} />{EVENT_CATEGORY_LABEL[e.category]}</Badge>{e.overdue && <Badge tone="red">overdue</Badge>}{e.completedAt && <Badge tone="green">completed</Badge>}</div>
      <p>{e.allDay ? fmtLongDay(e.startsAt) : `${fmtDateTime(e.startsAt)}${e.endsAt ? ` – ${fmtTime(e.endsAt)}` : ""}`} <span className="text-muted">({relative(e.startsAt)})</span></p>
      {(e.location || e.examination?.venue) && <p className="flex items-center gap-1.5 text-ink-2"><MapPin className="size-4" />{e.examination?.venue ?? e.location}</p>}
      {e.subject && <p className="text-ink-2">Subject: {e.subject.name}</p>}
      {e.goal && <p className="text-ink-2">Goal: <Link to={`/app/planner/goals/${e.goal.id}`} className="text-accent hover:underline">{e.goal.title}</Link></p>}
      {e.examination && <p className="text-ink-2">Preparation: {e.examination.preparationStatus.toLowerCase().replace("_", " ")}</p>}
      {e.assignment && <p className="text-ink-2">Status: {e.assignment.submissionStatus.toLowerCase().replace("_", " ")}{e.assignment.submittedAt ? ` on ${fmtDateTime(e.assignment.submittedAt)}` : ""} · {e.assignment.priority.toLowerCase()} priority</p>}
      {e.examination?.syllabus && <div><p className="text-xs font-medium text-muted uppercase">Syllabus</p><p className="whitespace-pre-wrap">{e.examination.syllabus}</p></div>}
      {e.description && <p className="whitespace-pre-wrap text-ink-2">{e.description}</p>}
      {e.reminderMins.length > 0 && <p className="text-xs text-muted">Reminders: {e.reminderMins.map((m) => (m >= 1440 ? `${m / 1440} day(s)` : m >= 60 ? `${m / 60} h` : `${m} min`)).join(", ")} before</p>}
    </div>
  );
}

function AgendaList({ items, days, onItem, onAdd }: { items: Item[]; days: Date[] | null; onItem: (i: Item) => void; onAdd: (d: Date) => void }) {
  const groups = days ? days.map((d) => ({ d, list: items.filter((i) => same(i.start, d)) })) : [...new Set(items.map((i) => day0(i.start).getTime()))].map((t) => ({ d: new Date(t), list: items.filter((i) => day0(i.start).getTime() === t) }));
  if (!groups.some((g) => g.list.length)) {
    return <EmptyState title="Nothing scheduled" description="Add an exam, assignment or event, or schedule a study session." action={<Button size="sm" leftIcon={<Plus />} onClick={() => onAdd(days?.[0] ?? add(new Date(), 1))}>Add event</Button>} />;
  }
  return (
    <div className="space-y-4">
      {groups.map(({ d, list }) => (
        <section key={d.toISOString()}>
          <h3 className={cn("mb-2 text-sm font-semibold", same(d, new Date()) && "text-accent")}>{fmtLongDay(d)}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {list.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onItem(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50">
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", CAT_STYLE[i.cat].dot)} />
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{i.allDay ? "all day" : fmtTime(i.start)}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", i.done && "text-muted line-through")}>{i.title}</span>
                  <span className="hidden text-xs text-muted sm:inline">{EVENT_CATEGORY_LABEL[i.cat]}{i.session ? ` · ${fmtMinutes(i.session.plannedMins)}` : ""}</span>
                  {i.overdue && <Badge tone="red">overdue</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

