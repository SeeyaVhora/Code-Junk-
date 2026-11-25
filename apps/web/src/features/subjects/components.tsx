import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { LANGUAGES } from "@code-junk/shared";
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { useSubjectMutations, useSubjects, type Subject } from "./api";

/** Create/edit subject dialog. */
export function SubjectDialog({ open, onClose, subject, onCreated }: { open: boolean; onClose: () => void; subject?: Subject; onCreated?: (s: Subject) => void }) {
  const m = useSubjectMutations();
  const [name, setName] = useState(subject?.name ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [isCoding, setIsCoding] = useState(subject?.isCoding ?? true);
  const [defaultLang, setDefaultLang] = useState(subject?.defaultLang ?? "");
  const [error, setError] = useState<string>();
  const busy = m.create.isPending || m.update.isPending;

  const save = () => {
    if (!name.trim()) return setError("Give the subject a name.");
    const body = { name: name.trim(), description: description || null, isCoding, defaultLang: isCoding && defaultLang ? (defaultLang as never) : null };
    if (subject) m.update.mutate({ id: subject.id, ...body }, { onSuccess: onClose });
    else
      m.create.mutate(body, {
        onSuccess: (r) => {
          onCreated?.(r.subject);
          onClose();
        },
      });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={subject ? "Edit subject" : "New subject"}
      description="Subjects organise your snippets, questions, papers and plans."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{subject ? "Save" : "Create subject"}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" error={error}>{(a) => <Input {...a} autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} placeholder="e.g. Go, Data Structures, Mathematics" maxLength={80} />}</Field>
        <Field label="Description (optional)">{(a) => <Textarea {...a} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" maxLength={500} />}</Field>
        <Checkbox checked={isCoding} onChange={(e) => setIsCoding(e.target.checked)} label="This is a programming subject (shows language options)" />
        {isCoding && (
          <Field label="Default language">
            {(a) => (
              <Select {...a} value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)}>
                <option value="">None</option>
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </Select>
            )}
          </Field>
        )}
      </form>
    </Dialog>
  );
}

/** Subject + topic selects with "new subject" / "new topic" shortcuts. */
export function SubjectTopicPicker({
  subjectId,
  topicId,
  onChange,
  subjectError,
  allowNoTopic = true,
  subjectOptional = false,
}: {
  subjectId: string;
  topicId: string;
  onChange: (v: { subjectId: string; topicId: string; subject?: Subject }) => void;
  subjectError?: string;
  allowNoTopic?: boolean;
  subjectOptional?: boolean;
}) {
  const subjects = useSubjects();
  const m = useSubjectMutations();
  const [newSubject, setNewSubject] = useState(false);
  const [newTopic, setNewTopic] = useState<string | null>(null);
  const subject = subjects.data?.find((s) => s.id === subjectId);

  const addTopic = () => {
    if (!newTopic?.trim() || !subject) return;
    m.addTopic.mutate(
      { subjectId: subject.id, name: newTopic.trim() },
      { onSuccess: (r) => { onChange({ subjectId, topicId: (r as { topic: { id: string } }).topic.id, subject }); setNewTopic(null); } },
    );
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={subjectOptional ? "Subject (optional)" : "Subject"} error={subjectError}>
        {(a) => (
          <div className="flex gap-2">
            <Select {...a} className="flex-1" value={subjectId} onChange={(e) => onChange({ subjectId: e.target.value, topicId: "", subject: subjects.data?.find((s) => s.id === e.target.value) })} disabled={subjects.isPending}>
              <option value="">{subjects.isPending ? "Loading…" : subjectOptional ? "None" : "Choose a subject"}</option>
              {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button variant="secondary" size="icon" aria-label="New subject" onClick={() => setNewSubject(true)}><Plus /></Button>
          </div>
        )}
      </Field>
      <Field label="Topic">
        {(a) =>
          newTopic !== null ? (
            <div className="flex gap-2">
              <Input {...a} autoFocus value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } if (e.key === "Escape") setNewTopic(null); }} placeholder="New topic name" maxLength={80} />
              <Button onClick={addTopic} loading={m.addTopic.isPending}>Add</Button>
              <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setNewTopic(null)}><X /></Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select {...a} className="flex-1" value={topicId} onChange={(e) => onChange({ subjectId, topicId: e.target.value, subject })} disabled={!subject}>
                <option value="">{allowNoTopic ? "No topic" : "Choose a topic"}</option>
                {subject?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Button variant="secondary" size="icon" aria-label="New topic" disabled={!subject} onClick={() => setNewTopic("")}><Plus /></Button>
            </div>
          )
        }
      </Field>
      {newSubject && <SubjectDialog open onClose={() => setNewSubject(false)} onCreated={(s) => onChange({ subjectId: s.id, topicId: "", subject: s })} />}
    </div>
  );
}

/** Free-form tags: Enter or comma adds, Backspace on empty removes the last. */
export function TagInput({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tags = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.length) onChange([...new Set([...value, ...tags])].slice(0, 20));
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-ink"><X className="size-3" /></button>
        </span>
      ))}
      <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)} placeholder={value.length ? "" : "Add tags, press Enter"} className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
    </div>
  );
}
