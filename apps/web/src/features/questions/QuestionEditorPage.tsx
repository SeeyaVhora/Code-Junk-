import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { DIFFICULTIES, DIFFICULTY_LABEL, LANGUAGES, QUESTION_TYPES, QUESTION_TYPE_LABEL, questionInput, type QuestionInput } from "@code-junk/shared";
import { Button, Field, Input, PageHeader, QueryView, Select, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { SubjectTopicPicker, TagInput } from "@/features/subjects/components";
import { useQuestion, useQuestionMutations, type QuestionFull } from "./api";

export default function QuestionEditorPage() {
  const { id } = useParams();
  const q = useQuestion(id);
  if (id) return <QueryView query={q}>{(question) => <Editor q={question} />}</QueryView>;
  return <Editor />;
}

const LETTERS = "ABCDEFGH";

function Editor({ q }: { q?: QuestionFull }) {
  const navigate = useNavigate();
  const m = useQuestionMutations();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<QuestionInput>(() => ({
    title: q?.title ?? "",
    body: q?.body ?? "",
    subjectId: q?.subjectId ?? "",
    topicId: q?.topicId ?? null,
    language: (q?.language as QuestionInput["language"]) ?? null,
    difficulty: (q?.difficulty as QuestionInput["difficulty"]) ?? "INTERMEDIATE",
    type: (q?.type as QuestionInput["type"]) ?? "THEORY",
    options: q?.options ?? [{ id: "A", text: "" }, { id: "B", text: "" }],
    correctOptionIds: q?.correctOptionIds ?? [],
    expectedAnswer: q?.expectedAnswer ?? "",
    solution: q?.solution ?? "",
    explanation: q?.explanation ?? "",
    source: (q?.source as QuestionInput["source"]) ?? "MANUAL",
    sourceUrl: q?.sourceUrl ?? null,
    sourceAttribution: q?.sourceAttribution ?? "",
    personalNotes: q?.personalNotes ?? "",
    tags: q?.tags ?? [],
  }));
  const set = <K extends keyof QuestionInput>(k: K, v: QuestionInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const isMcq = form.type === "MCQ";
  const options = form.options ?? [];

  const save = () => {
    const payload = { ...form, topicId: form.topicId || null, sourceUrl: form.sourceUrl || null, options: isMcq ? options : null, correctOptionIds: isMcq ? form.correctOptionIds : [] };
    const parsed = questionInput.safeParse(payload);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      if (e.subjectId) e.subjectId = "Choose a subject.";
      setErrors(e);
      return;
    }
    const onError = (err: unknown) => err instanceof ApiError && setErrors(err.fieldErrors);
    if (q) {
      const { source: _s, ...rest } = parsed.data;
      m.update.mutate({ id: q.id, ...rest }, { onSuccess: () => navigate(`/app/library/questions/${q.id}`), onError });
    } else m.create.mutate(parsed.data, { onSuccess: (r) => navigate(`/app/library/questions/${r.question.id}`), onError });
  };

  return (
    <div>
      <PageHeader title={q ? "Edit question" : "New question"} description={q ? undefined : "Write your own question, or save one from a coding platform with its link."} actions={<><Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button loading={m.create.isPending || m.update.isPending} onClick={save}>Save question</Button></>} />
      <form className="max-w-3xl space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title" error={errors.title}>{(a) => <Input {...a} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />}</Field>
        <SubjectTopicPicker subjectId={form.subjectId} topicId={form.topicId ?? ""} subjectError={errors.subjectId} onChange={(v) => { setForm((f) => ({ ...f, subjectId: v.subjectId, topicId: v.topicId || null })); setErrors((e) => ({ ...e, subjectId: "" })); }} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">{(a) => <Select {...a} value={form.type} onChange={(e) => set("type", e.target.value as QuestionInput["type"])}>{QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}</Select>}</Field>
          <Field label="Difficulty">{(a) => <Select {...a} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value as QuestionInput["difficulty"])}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}</Select>}</Field>
          <Field label="Language">{(a) => <Select {...a} value={form.language ?? ""} onChange={(e) => set("language", (e.target.value || null) as QuestionInput["language"])}><option value="">None</option>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}</Field>
        </div>
        <Field label="Question" hint="Markdown supported. Put code in ``` fences." error={errors.body}>{(a) => <Textarea {...a} value={form.body} onChange={(e) => set("body", e.target.value)} className="min-h-36 font-mono text-[13px]" />}</Field>

        {isMcq && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-medium">Options (tick the correct one)</legend>
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Option ${o.id} is correct`} className="size-4 accent-[var(--accent)]" checked={(form.correctOptionIds ?? []).includes(o.id)} onChange={(e) => set("correctOptionIds", e.target.checked ? [...(form.correctOptionIds ?? []), o.id] : (form.correctOptionIds ?? []).filter((x) => x !== o.id))} />
                <span className="w-5 font-mono text-sm">{o.id}</span>
                <Input aria-label={`Option ${o.id}`} value={o.text} onChange={(e) => set("options", options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <Button size="icon-sm" variant="ghost" aria-label={`Remove option ${o.id}`} disabled={options.length <= 2} onClick={() => { const next = options.filter((_, j) => j !== i).map((x, j) => ({ ...x, id: LETTERS[j]! })); set("options", next); set("correctOptionIds", []); }}><Trash2 /></Button>
              </div>
            ))}
            {options.length < 8 && <Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => set("options", [...options, { id: LETTERS[options.length]!, text: "" }])}>Add option</Button>}
            {(errors.options || errors.correctOptionIds) && <p className="text-xs text-danger" role="alert">{errors.options || errors.correctOptionIds}</p>}
          </fieldset>
        )}

        {!isMcq && <Field label={form.type === "OUTPUT_PREDICTION" ? "Exact expected output" : "Expected answer"} hint={form.type === "OUTPUT_PREDICTION" ? "Used to check answers exactly." : "A model answer used for grading."}>{(a) => <Textarea {...a} value={form.expectedAnswer ?? ""} onChange={(e) => set("expectedAnswer", e.target.value)} className="min-h-24 font-mono text-[13px]" />}</Field>}
        <Field label="Solution (optional)">{(a) => <Textarea {...a} value={form.solution ?? ""} onChange={(e) => set("solution", e.target.value)} className="min-h-24 font-mono text-[13px]" />}</Field>
        <Field label="Explanation (optional)">{(a) => <Textarea {...a} value={form.explanation ?? ""} onChange={(e) => set("explanation", e.target.value)} className="min-h-20" />}</Field>

        {!q && (
          <Field label="Where is it from?">{(a) => <Select {...a} value={form.source} onChange={(e) => set("source", e.target.value as QuestionInput["source"])}><option value="MANUAL">Written by me</option><option value="EXTERNAL_PLATFORM">Coding platform (LeetCode, Codeforces, CodeChef…)</option><option value="SAMPLE_PAPER">Sample / past paper</option></Select>}</Field>
        )}
        {(form.source === "EXTERNAL_PLATFORM" || form.sourceUrl) && (
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <Field label="Link to the original" hint="Store the link and your own summary; don't paste copyrighted statements." error={errors.sourceUrl}>{(a) => <Input {...a} type="url" value={form.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value || null)} placeholder="https://leetcode.com/problems/…" />}</Field>
            <Field label="Platform">{(a) => <Input {...a} value={form.sourceAttribution ?? ""} onChange={(e) => set("sourceAttribution", e.target.value)} placeholder="LeetCode" />}</Field>
          </div>
        )}
        <Field label="Tags">{(a) => <TagInput id={a.id} value={form.tags ?? []} onChange={(t) => set("tags", t)} />}</Field>
        <Field label="Personal notes (optional)">{(a) => <Textarea {...a} value={form.personalNotes ?? ""} onChange={(e) => set("personalNotes", e.target.value)} />}</Field>
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" loading={m.create.isPending || m.update.isPending}>Save question</Button></div>
      </form>
    </div>
  );
}
