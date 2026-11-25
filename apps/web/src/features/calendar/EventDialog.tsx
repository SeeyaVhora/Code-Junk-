import { useState } from "react";
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABEL, PREPARATION_STATUSES, PRIORITIES, SUBMISSION_STATUSES, eventInput, type EventCategory } from "@code-junk/shared";
import { Button, Checkbox, Chip, Dialog, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { useSubjects } from "@/features/subjects/api";

export interface CalEvent {
  id: string;
  category: EventCategory;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  completedAt: string | null;
  overdue: boolean;
  reminderMins: number[];
  subject: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  examination: { venue: string | null; syllabus: string | null; preparationStatus: string } | null;
  assignment: { assignedAt: string | null; submissionStatus: string; submittedAt: string | null; priority: string } | null;
}

const REMINDERS = [
  { mins: 15, label: "15 min" },
  { mins: 60, label: "1 hour" },
  { mins: 1440, label: "1 day" },
  { mins: 4320, label: "3 days" },
  { mins: 10080, label: "1 week" },
];
const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace(/_/g, " ");

export function EventDialog({ event, defaultDate, onClose, onSaved }: { event?: CalEvent; defaultDate?: Date; onClose: () => void; onSaved: () => void }) {
  const subjects = useSubjects();
  const toast = useToast();
  const start = defaultDate ?? new Date(Date.now() + 86_400_000);
  if (!event && !defaultDate) start.setHours(9, 0, 0, 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    category: event?.category ?? ("EXAMINATION" as EventCategory),
    title: event?.title ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    subjectId: event?.subject?.id ?? "",
    allDay: event?.allDay ?? false,
    startsAt: toLocalInput(event?.startsAt ?? start),
    endsAt: event?.endsAt ? toLocalInput(event.endsAt) : "",
    reminderMins: event?.reminderMins ?? [1440],
    venue: event?.examination?.venue ?? "",
    syllabus: event?.examination?.syllabus ?? "",
    preparationStatus: event?.examination?.preparationStatus ?? "NOT_STARTED",
    assignedAt: event?.assignment?.assignedAt ? toLocalInput(event.assignment.assignedAt).slice(0, 10) : "",
    submissionStatus: event?.assignment?.submissionStatus ?? "NOT_STARTED",
    priority: event?.assignment?.priority ?? "MEDIUM",
  });
  const cat = f.category;

  const save = async () => {
    const startIso = f.startsAt ? fromLocalInput(f.allDay ? f.startsAt.slice(0, 10) + "T00:00" : f.startsAt) : "";
    const body = {
      category: f.category,
      title: f.title,
      description: f.description || null,
      location: f.location || null,
      subjectId: f.subjectId || null,
      startsAt: startIso,
      endsAt: f.endsAt && !f.allDay ? fromLocalInput(f.endsAt) : null,
      allDay: f.allDay,
      reminderMins: f.reminderMins,
      ...(cat === "EXAMINATION" ? { venue: f.venue || null, syllabus: f.syllabus || null, preparationStatus: f.preparationStatus } : {}),
      ...(cat === "ASSIGNMENT" ? { assignedAt: f.assignedAt ? fromLocalInput(f.assignedAt + "T00:00") : null, submissionStatus: f.submissionStatus, priority: f.priority } : {}),
    };
    const parsed = eventInput.safeParse(body);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setBusy(true);
    try {
      if (event) {
        const { category: _c, goalId: _g, ...patch } = parsed.data;
        await api(`/calendar/${event.id}`, { method: "PATCH", body: patch });
      } else await api("/calendar", { method: "POST", body: parsed.data });
      toast.success(event ? "Event updated." : "Event added.");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={event ? "Edit event" : "Add to calendar"} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-4">
        {!event && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event type">
            {EVENT_CATEGORIES.filter((c) => c !== "LEARNING_DEADLINE").map((c) => <Chip key={c} selected={cat === c} onClick={() => setF({ ...f, category: c })}>{EVENT_CATEGORY_LABEL[c]}</Chip>)}
          </div>
        )}
        <Field label={cat === "EXAMINATION" ? "Exam name" : cat === "ASSIGNMENT" ? "Assignment title" : cat === "COLLEGE_EVENT" ? "Event name" : "Title"} error={errors.title}>{(a) => <Input {...a} autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={cat === "ASSIGNMENT" ? "Due" : "Starts"} error={errors.startsAt}>{(a) => <Input {...a} type={f.allDay ? "date" : "datetime-local"} value={f.allDay ? f.startsAt.slice(0, 10) : f.startsAt} onChange={(e) => setF({ ...f, startsAt: f.allDay ? e.target.value + "T00:00" : e.target.value })} />}</Field>
          {cat !== "ASSIGNMENT" && !f.allDay && <Field label="Ends (optional)" error={errors.endsAt}>{(a) => <Input {...a} type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />}</Field>}
        </div>
        <Checkbox checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} label="All day" />
        <div className="grid gap-4 sm:grid-cols-2">
          {cat !== "PERSONAL" && <Field label="Subject (optional)">{(a) => <Select {...a} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">None</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>}
          {cat === "EXAMINATION" ? <Field label="Venue">{(a) => <Input {...a} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />}</Field> : cat !== "ASSIGNMENT" && <Field label="Location">{(a) => <Input {...a} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}</Field>}
        </div>
        {cat === "EXAMINATION" && (
          <>
            <Field label="Preparation">{(a) => <Select {...a} value={f.preparationStatus} onChange={(e) => setF({ ...f, preparationStatus: e.target.value })}>{PREPARATION_STATUSES.map((p) => <option key={p} value={p}>{nice(p)}</option>)}</Select>}</Field>
            <Field label="Syllabus (optional)">{(a) => <Textarea {...a} value={f.syllabus} onChange={(e) => setF({ ...f, syllabus: e.target.value })} className="min-h-20" />}</Field>
          </>
        )}
        {cat === "ASSIGNMENT" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Assigned on">{(a) => <Input {...a} type="date" value={f.assignedAt} onChange={(e) => setF({ ...f, assignedAt: e.target.value })} />}</Field>
            <Field label="Status">{(a) => <Select {...a} value={f.submissionStatus} onChange={(e) => setF({ ...f, submissionStatus: e.target.value })}>{SUBMISSION_STATUSES.filter((s) => s !== "LATE").map((s) => <option key={s} value={s}>{nice(s)}</option>)}</Select>}</Field>
            <Field label="Priority">{(a) => <Select {...a} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{nice(p)}</option>)}</Select>}</Field>
          </div>
        )}
        <Field label={cat === "PERSONAL" ? "Notes" : "Description (optional)"}>{(a) => <Textarea {...a} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-16" />}</Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Remind me before</p>
          <div className="flex flex-wrap gap-2">{REMINDERS.map((r) => <Chip key={r.mins} selected={f.reminderMins.includes(r.mins)} onClick={() => setF({ ...f, reminderMins: f.reminderMins.includes(r.mins) ? f.reminderMins.filter((m) => m !== r.mins) : [...f.reminderMins, r.mins] })}>{r.label}</Chip>)}</div>
        </div>
      </div>
    </Dialog>
  );
}
