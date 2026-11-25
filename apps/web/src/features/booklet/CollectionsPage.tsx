import { useState } from "react";
import { Link } from "react-router";
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, EmptyState, Field, Input, QueryView, Select, Textarea, useConfirm } from "@/components/ui";
import { useCollections, useSubjectMutations, useSubjects, type Collection } from "@/features/subjects/api";

export default function CollectionsPage() {
  const q = useCollections();
  const subjects = useSubjects();
  const m = useSubjectMutations();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<Collection> | null>(null);
  const [error, setError] = useState<string>();

  const save = () => {
    if (!editing?.name?.trim()) return setError("Give the collection a name.");
    if (editing.id) m.updateCollection.mutate({ id: editing.id, name: editing.name, description: editing.description ?? null }, { onSuccess: () => setEditing(null) });
    else {
      if (!editing.subjectId) return setError("Choose a subject.");
      m.createCollection.mutate({ name: editing.name, subjectId: editing.subjectId, description: editing.description ?? null }, { onSuccess: () => setEditing(null) });
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" leftIcon={<Plus />} disabled={!subjects.data?.length} onClick={() => { setError(undefined); setEditing({ subjectId: subjects.data?.[0]?.id }); }}>New collection</Button>
      </div>
      <QueryView query={q}>
        {(cols) =>
          cols.length === 0 ? (
            <EmptyState icon={<FolderOpen />} title="No collections yet" description={subjects.data?.length ? "Collections group related snippets inside a subject, like “Interview prep” or “Lab 3”." : "Create a subject first, then group its snippets into collections."} action={subjects.data?.length ? <Button leftIcon={<Plus />} onClick={() => setEditing({ subjectId: subjects.data[0]!.id })}>Create a collection</Button> : undefined} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cols.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/app/booklet?collectionId=${c.id}`} className="min-w-0">
                      <p className="truncate font-semibold hover:underline">{c.name}</p>
                      <p className="text-xs text-muted">{c.subject.name} · {c._count.snippets} snippet{c._count.snippets === 1 ? "" : "s"}</p>
                    </Link>
                    <div className="flex">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => { setError(undefined); setEditing(c); }}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={async () => { if (await confirm({ title: `Delete “${c.name}”?`, body: "Its snippets stay in your booklet; only the grouping is removed.", danger: true, confirmLabel: "Delete" })) m.removeCollection.mutate(c.id); }}><Trash2 /></Button>
                    </div>
                  </div>
                  {c.description && <p className="mt-2 line-clamp-2 text-sm text-ink-2">{c.description}</p>}
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit collection" : "New collection"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={m.createCollection.isPending || m.updateCollection.isPending} onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Name" error={error}>{(a) => <Input {...a} autoFocus value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} />}</Field>
            {!editing.id && (
              <Field label="Subject">{(a) => <Select {...a} value={editing.subjectId ?? ""} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
            )}
            <Field label="Description (optional)">{(a) => <Textarea {...a} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="min-h-16" />}</Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}
