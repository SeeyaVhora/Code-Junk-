import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Upload } from "lucide-react";
import { LANGUAGES, snippetInput, type SnippetInput } from "@code-junk/shared";
import { Button, Checkbox, Field, Input, PageHeader, QueryView, Select, Textarea, useToast } from "@/components/ui";
import { CodeEditor } from "@/components/code/CodeEditor";
import { ApiError } from "@/lib/api";
import { useCollections, useSubjects } from "@/features/subjects/api";
import { SubjectTopicPicker, TagInput } from "@/features/subjects/components";
import { useSnippet, useSnippetMutations, type Snippet } from "./api";

const EXT_TO_LANG = Object.fromEntries(LANGUAGES.map((l) => [l.ext, l.id])) as Record<string, string>;
Object.assign(EXT_TO_LANG, { h: "c", hpp: "cpp", cc: "cpp", jsx: "javascript", tsx: "typescript", mjs: "javascript", txt: "plaintext", yml: "plaintext" });
const ACCEPT = [...new Set([...LANGUAGES.map((l) => "." + l.ext), ".h", ".hpp", ".cc", ".jsx", ".tsx", ".mjs"])].join(",");

export default function SnippetEditorPage() {
  const { id } = useParams();
  const existing = useSnippet(id);
  if (id) return <QueryView query={existing}>{(d) => <Editor snippet={d.snippet} />}</QueryView>;
  return <Editor />;
}

function Editor({ snippet }: { snippet?: Snippet }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const m = useSnippetMutations();
  const subjects = useSubjects();
  const collections = useCollections();
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<SnippetInput>(() => ({
    title: snippet?.title ?? "",
    language: (snippet?.language as SnippetInput["language"]) ?? "go",
    subjectId: snippet?.subjectId ?? params.get("subjectId") ?? "",
    topicId: snippet?.topicId ?? params.get("topicId") ?? null,
    collectionId: snippet?.collectionId ?? null,
    description: snippet?.description ?? "",
    code: snippet?.code ?? "",
    notes: snippet?.notes ?? "",
    tags: snippet?.tags ?? [],
    isFavorite: snippet?.isFavorite ?? false,
  }));
  const set = <K extends keyof SnippetInput>(k: K, v: SnippetInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  // A new snippet in a subject with a default language starts in that language.
  useEffect(() => {
    if (snippet || !subjects.data) return;
    const s = subjects.data.find((x) => x.id === form.subjectId);
    if (s?.defaultLang) setForm((f) => ({ ...f, language: s.defaultLang as SnippetInput["language"] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.subjectId, subjects.data]);

  const onFile = async (file: File) => {
    if (file.size > 500_000) return toast.error("That file is larger than 500 KB.");
    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    setForm((f) => ({
      ...f,
      code: text,
      title: f.title || file.name.replace(/\.[^.]+$/, ""),
      language: (EXT_TO_LANG[ext] as SnippetInput["language"]) ?? f.language,
    }));
    toast.success(`Loaded ${file.name}.`);
  };

  const save = () => {
    const parsed = snippetInput.safeParse({ ...form, topicId: form.topicId || null, collectionId: form.collectionId || null });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      if (e.subjectId) e.subjectId = "Choose a subject.";
      setErrors(e);
      return;
    }
    const onError = (err: unknown) => {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    };
    if (snippet) m.update.mutate({ id: snippet.id, ...parsed.data }, { onSuccess: () => { toast.success("Snippet updated."); navigate(`/app/booklet/snippets/${snippet.id}`); }, onError });
    else m.create.mutate(parsed.data, { onSuccess: (r) => navigate(`/app/booklet/snippets/${r.snippet.id}`), onError });
  };

  const subjectCollections = collections.data?.filter((c) => c.subjectId === form.subjectId) ?? [];

  return (
    <div>
      <Link to={snippet ? `/app/booklet/snippets/${snippet.id}` : "/app/booklet"} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Back</Link>
      <PageHeader title={snippet ? "Edit snippet" : "New snippet"} actions={<><Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button loading={m.create.isPending || m.update.isPending} onClick={save}>Save snippet</Button></>} />
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Title" error={errors.title}>{(a) => <Input {...a} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Implementing an interface" maxLength={160} autoFocus={!snippet} />}</Field>
          <Field label="Language" error={errors.language}>{(a) => <Select {...a} value={form.language} onChange={(e) => set("language", e.target.value as SnippetInput["language"])}>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}</Field>
        </div>
        <SubjectTopicPicker subjectId={form.subjectId} topicId={form.topicId ?? ""} subjectError={errors.subjectId} onChange={(v) => { setForm((f) => ({ ...f, subjectId: v.subjectId, topicId: v.topicId || null, collectionId: v.subjectId === f.subjectId ? f.collectionId : null })); setErrors((e) => ({ ...e, subjectId: "" })); }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Collection (optional)">{(a) => <Select {...a} value={form.collectionId ?? ""} onChange={(e) => set("collectionId", e.target.value || null)} disabled={!subjectCollections.length}><option value="">{subjectCollections.length ? "None" : "No collections in this subject"}</option>{subjectCollections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Tags">{(a) => <TagInput id={a.id} value={form.tags ?? []} onChange={(t) => set("tags", t)} />}</Field>
        </div>
        <Field label="Description (optional)" error={errors.description}>{(a) => <Textarea {...a} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} className="min-h-16" placeholder="What does this code do?" />}</Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">Code</span>
            <Button size="sm" variant="ghost" leftIcon={<Upload />} onClick={() => fileRef.current?.click()}>Upload file</Button>
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>
          <CodeEditor value={form.code} onChange={(v) => set("code", v)} language={form.language} minHeight="300px" ariaLabel="Snippet code" />
          {errors.code && <p className="mt-1 text-xs text-danger" role="alert">{errors.code}</p>}
        </div>
        <Field label="Personal notes (optional)" hint="What you learned, gotchas, links. Shown under the code.">{(a) => <Textarea {...a} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className="min-h-28" />}</Field>
        <Checkbox checked={!!form.isFavorite} onChange={(e) => set("isFavorite", e.target.checked)} label="Add to favourites" />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={m.create.isPending || m.update.isPending}>Save snippet</Button>
        </div>
      </form>
    </div>
  );
}
