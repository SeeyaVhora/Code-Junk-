import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Check, FileArchive, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { languageLabel } from "@code-junk/shared";
import { Badge, Button, ButtonLink, EmptyState, Input, Menu, MenuItem, QueryView, Section, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadPost, useSubjectMutations, type Subject } from "@/features/subjects/api";
import { SubjectDialog } from "@/features/subjects/components";
import { useSnippetList } from "./api";

interface SubjectDetail extends Omit<Subject, "topics"> {
  topics: { id: string; name: string; position: number; parentId: string | null; _count: { snippets: number; questions: number } }[];
  collections: { id: string; name: string; _count: { snippets: number } }[];
}

export default function SubjectDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const focusTopic = params.get("topic");
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const m = useSubjectMutations();
  const q = useQuery({ queryKey: ["subject", id], queryFn: async () => (await api<{ subject: SubjectDetail }>(`/subjects/${id}`)).subject });
  const snippets = useSnippetList({ subjectId: id, sort: "booklet" });
  const [editing, setEditing] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const remove = async (s: SubjectDetail) => {
    const impact = await api<{ deletes: Record<string, number>; keepsButUnlinks: number }>(`/subjects/${s.id}/impact`);
    const d = impact.deletes;
    const ok = await confirm({
      title: `Delete “${s.name}”?`,
      danger: true,
      confirmLabel: "Delete subject",
      body: (
        <>
          <p>This permanently deletes the subject and what belongs to it:</p>
          <ul className="mt-2 list-disc pl-5">
            <li>{d.snippets} snippet(s), {d.topics} topic(s)</li>
            <li>{d.questions} question(s), {d.quizzes} quiz(zes), {d.papers} paper(s)</li>
          </ul>
          {impact.keepsButUnlinks > 0 && <p className="mt-2">{impact.keepsButUnlinks} goal(s), session(s) or calendar event(s) are kept and simply lose the subject link.</p>}
        </>
      ),
    });
    if (ok) m.remove.mutate(s.id, { onSuccess: () => navigate("/app/booklet/subjects") });
  };

  const move = (s: SubjectDetail, index: number, dir: -1 | 1) => {
    const roots = s.topics.filter((t) => !t.parentId);
    const ids = roots.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    m.reorderTopics.mutate({ subjectId: s.id, ids });
  };

  const doExport = async (format: "zip" | "pdf") => {
    setExporting(format);
    try {
      await downloadPost("/snippets/export", { subjectId: id, format });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  const all = snippets.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <QueryView query={q}>
      {(s) => (
        <div>
          <Link to="/app/booklet/subjects" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> All subjects</Link>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{s.name}</h2>
              {s.description && <p className="mt-1 text-sm text-ink-2">{s.description}</p>}
              <p className="mt-1 text-xs text-muted">{s.isCoding ? (s.defaultLang ? languageLabel(s.defaultLang) : "Programming subject") : "Non-programming subject"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={`/app/booklet/new?subjectId=${s.id}`} size="sm" leftIcon={<Plus />}>Add snippet</ButtonLink>
              <Button size="sm" variant="secondary" leftIcon={<FileArchive />} loading={exporting === "zip"} disabled={!s._count.snippets} onClick={() => void doExport("zip")}>ZIP</Button>
              <Button size="sm" variant="secondary" leftIcon={<FileText />} loading={exporting === "pdf"} disabled={!s._count.snippets} onClick={() => void doExport("pdf")}>PDF booklet</Button>
              <Menu trigger={(p) => <Button size="sm" variant="ghost" {...p}>More</Button>}>
                {(close) => (
                  <>
                    <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(true); }}>Edit subject</MenuItem>
                    <MenuItem icon={<Trash2 />} danger onClick={() => { close(); void remove(s); }}>Delete subject</MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
            <Section title={`Topics (${s.topics.length})`}>
              <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newTopic.trim()) m.addTopic.mutate({ subjectId: s.id, name: newTopic.trim() }, { onSuccess: () => setNewTopic("") }); }}>
                <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="e.g. Pointers" aria-label="New topic name" maxLength={80} />
                <Button type="submit" loading={m.addTopic.isPending} leftIcon={<Plus />}>Add</Button>
              </form>
              {s.topics.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">No topics yet. Add the topics you're learning in {s.name}.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {s.topics.filter((t) => !t.parentId).map((t, i, arr) => (
                    <li key={t.id} className={cn("flex items-center gap-2 py-2", focusTopic === t.id && "rounded bg-accent-soft/40 px-1")}>
                      <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                      {renaming?.id === t.id ? (
                        <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); m.renameTopic.mutate({ id: t.id, name: renaming.name }, { onSuccess: () => setRenaming(null) }); }}>
                          <Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} className="h-8" aria-label="Topic name" />
                          <Button type="submit" size="icon-sm" aria-label="Save"><Check /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setRenaming(null)}><X /></Button>
                        </form>
                      ) : (
                        <>
                          <Link to={`/app/booklet?subjectId=${s.id}&topicId=${t.id}`} className="flex-1 truncate text-sm hover:underline">{t.name}</Link>
                          <span className="text-xs text-muted">{t._count.snippets}</span>
                          <div className="flex">
                            <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(s, i, -1)}><ArrowUp /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} down`} disabled={i === arr.length - 1} onClick={() => move(s, i, 1)}><ArrowDown /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}><Pencil /></Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Delete ${t.name}`}
                              onClick={async () => {
                                if (await confirm({ title: `Delete topic “${t.name}”?`, body: `Its ${t._count.snippets} snippet(s) and ${t._count.questions} question(s) are kept; they just won't have a topic.`, danger: true, confirmLabel: "Delete topic" })) m.removeTopic.mutate(t.id);
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {s.collections.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">Collections</p>
                  <div className="flex flex-wrap gap-2">
                    {s.collections.map((c) => <Link key={c.id} to={`/app/booklet?collectionId=${c.id}`}><Badge tone="outline">{c.name} · {c._count.snippets}</Badge></Link>)}
                  </div>
                </div>
              )}
            </Section>

            <Section title="Table of contents">
              {all.length === 0 ? (
                <EmptyState title="This booklet is empty" description="Add your first snippet to this subject." action={<ButtonLink to={`/app/booklet/new?subjectId=${s.id}`} size="sm" leftIcon={<Plus />}>Add snippet</ButtonLink>} className="py-8" />
              ) : (
                <div className="space-y-4">
                  {[...s.topics.filter((t) => !t.parentId).map((t) => ({ id: t.id, name: t.name })), { id: null as string | null, name: "Other snippets" }].map((t) => {
                    const items = all.filter((x) => x.topicId === t.id);
                    if (!items.length) return null;
                    return (
                      <div key={t.id ?? "none"}>
                        <p className="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">{t.name}</p>
                        <ol className="space-y-0.5">
                          {items.map((x) => (
                            <li key={x.id}>
                              <Link to={`/app/booklet/snippets/${x.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
                                <span className="truncate">{x.title}</span>
                                <span className="shrink-0 font-mono text-[11px] text-muted">{languageLabel(x.language)}</span>
                              </Link>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                  {snippets.hasNextPage && <Button size="sm" variant="secondary" onClick={() => void snippets.fetchNextPage()}>Show more</Button>}
                </div>
              )}
            </Section>
          </div>
          {editing && <SubjectDialog open subject={s as unknown as Subject} onClose={() => setEditing(false)} />}
        </div>
      )}
    </QueryView>
  );
}
