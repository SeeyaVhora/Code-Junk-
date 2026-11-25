import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, FileUp, Library, Plus, Sparkles, Timer, Trash2, Upload } from "lucide-react";
import { DIFFICULTIES, DIFFICULTY_LABEL, DOCUMENT_KINDS, LANGUAGES, QUESTION_TYPES, QUESTION_TYPE_LABEL, type GeneratePaperInput, type QuestionType } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Checkbox, Chip, EmptyState, Field, Input, PageHeader, QueryView, Section, Segmented, Select, TabLinks, Textarea, errorMessage, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useSubjects } from "@/features/subjects/api";
import { useProviders } from "@/features/practice/GeneratePage";

export function PapersTabs({ action }: { action?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Practice Papers" description="Original exam-style papers generated from your syllabus and sample papers. Never presented as real exam papers." actions={action} />
      <TabLinks className="mb-6" tabs={[{ to: "/app/papers", label: "My papers", end: true }, { to: "/app/papers/new", label: "Generate new" }, { to: "/app/papers/attempts", label: "Previous attempts" }, { to: "/app/papers/materials", label: "Materials" }]} />
    </>
  );
}

interface PaperRow { id: string; title: string; totalMarks: number; durationMins: number; createdAt: string; subject: { name: string }; _count: { questions: number }; attempts: { id: string; mode: string; status: string; score: number | null; maxScore: number | null; startedAt: string }[] }

export function PapersListPage() {
  const q = useQuery({ queryKey: ["papers"], queryFn: async () => (await api<{ papers: PaperRow[] }>("/papers")).papers });
  return (
    <div>
      <PapersTabs action={<ButtonLink to="/app/papers/new" leftIcon={<Sparkles />}>Generate paper</ButtonLink>} />
      <QueryView query={q}>
        {(papers) =>
          papers.length === 0 ? (
            <EmptyState icon={<FileText />} title="No practice papers yet" description="Upload your syllabus or a sample paper, then generate an original paper in the same pattern." action={<ButtonLink to="/app/papers/new" leftIcon={<Sparkles />}>Generate your first paper</ButtonLink>} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {papers.map((p) => {
                const best = p.attempts.filter((a) => a.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
                return (
                  <li key={p.id}><Link to={`/app/papers/${p.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{p.subject.name} · {p._count.questions} questions · {p.totalMarks} marks · {p.durationMins} min · {fmtDate(p.createdAt)}</p>
                    <p className="mt-2 text-xs text-ink-2">{p.attempts.length ? `${p.attempts.length} attempt${p.attempts.length === 1 ? "" : "s"}${best ? ` · best ${best.score}/${best.maxScore}` : ""}` : "Not attempted yet"}</p>
                  </Link></li>
                );
              })}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

interface Doc { id: string; originalName: string; kind: string; sizeBytes: number; extractionStatus: string; createdAt: string; subject: { id: string; name: string } | null }
export const useDocuments = () => useQuery({ queryKey: ["documents"], queryFn: async () => (await api<{ documents: Doc[] }>("/documents")).documents });

async function uploadDocument(file: File, kind: string, subjectId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  if (subjectId) fd.append("subjectId", subjectId);
  const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)cj_csrf=([^;]+)/)?.[1] ?? "");
  const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "same-origin", headers: { "x-csrf-token": csrf } });
  const j = (await res.json()) as { document?: Doc; warning?: string | null; error?: { message: string } };
  if (!res.ok || !j.document) throw new Error(j.error?.message ?? "Upload failed.");
  return j;
}

function Uploader({ subjectId, onUploaded }: { subjectId: string; onUploaded?: (d: Doc) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState("SYLLABUS");
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await uploadDocument(file, kind, subjectId);
      if (r.warning) toast.error(r.warning);
      else toast.success(`${file.name} uploaded.`);
      void qc.invalidateQueries({ queryKey: ["documents"] });
      onUploaded?.(r.document!);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Type">{(a) => <Select {...a} value={kind} onChange={(e) => setKind(e.target.value)} className="w-48">{DOCUMENT_KINDS.filter((k) => !["ASSIGNMENT_ATTACHMENT", "CODE_FILE"].includes(k)).map((k) => <option key={k} value={k}>{k[0] + k.slice(1).toLowerCase().replace(/_/g, " ")}</option>)}</Select>}</Field>
      <input ref={ref} type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      <Button variant="secondary" leftIcon={<Upload />} loading={busy} onClick={() => ref.current?.click()}>Upload PDF or text</Button>
    </div>
  );
}

export function MaterialsPage() {
  const docs = useDocuments();
  const subjects = useSubjects();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [subjectId, setSubjectId] = useState("");
  const del = useMutation({ mutationFn: (id: string) => api(`/documents/${id}`, { method: "DELETE" }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Document deleted."); }, onError: toast.error });
  return (
    <div>
      <PapersTabs />
      <Section title="Upload material" className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Subject">{(a) => <Select {...a} className="w-48" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Uploader subjectId={subjectId} />
        </div>
        <p className="mt-2 text-xs text-muted">PDF or text, up to 10 MB. Text is extracted and used as reference when generating papers. Scanned image-only PDFs can't be read.</p>
      </Section>
      <QueryView query={docs}>
        {(list) =>
          list.length === 0 ? <EmptyState icon={<FileUp />} title="No materials uploaded" description="Upload your syllabus, sample papers and previous-year papers." /> : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.originalName}</p><p className="text-xs text-muted">{d.kind.toLowerCase().replace(/_/g, " ")} · {d.subject?.name ?? "no subject"} · {(d.sizeBytes / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}</p></div>
                  {d.extractionStatus !== "DONE" && <Badge tone="yellow">no readable text</Badge>}
                  <a href={`/api/documents/${d.id}/download`} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Download ${d.originalName}`}><Download className="size-4" /></a>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${d.originalName}`} onClick={async () => { if (await confirm({ title: `Delete ${d.originalName}?`, danger: true, confirmLabel: "Delete" })) del.mutate(d.id); }}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

type SectionSpec = GeneratePaperInput["sections"][number];

export function NewPaperPage() {
  const subjects = useSubjects();
  const docs = useDocuments();
  const providers = useProviders();
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState("");
  const subject = subjects.data?.find((s) => s.id === subjectId);
  const [title, setTitle] = useState("");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState<GeneratePaperInput["difficulty"]>("MIXED");
  const [duration, setDuration] = useState(90);
  const [balance, setBalance] = useState<"theory" | "balanced" | "coding">("balanced");
  const [sections, setSections] = useState<SectionSpec[]>([
    { title: "Section A — Short answers", types: ["MCQ", "SHORT_ANSWER"], questionCount: 5, marksPerQuestion: 2 },
    { title: "Section B — Theory", types: ["THEORY", "CONCEPTUAL"], questionCount: 3, marksPerQuestion: 5 },
    { title: "Section C — Coding", types: ["SHORT_CODE", "LONG_CODE"], questionCount: 2, marksPerQuestion: 10 },
  ]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = sections.reduce((s, x) => s + x.questionCount * x.marksPerQuestion, 0);
  const available = providers.data?.some((p) => p.available);

  const applyBalance = (b: typeof balance) => {
    setBalance(b);
    if (b === "theory") setSections([{ title: "Section A — Objective", types: ["MCQ"], questionCount: 10, marksPerQuestion: 1 }, { title: "Section B — Short answers", types: ["SHORT_ANSWER", "CONCEPTUAL"], questionCount: 5, marksPerQuestion: 4 }, { title: "Section C — Long answers", types: ["THEORY"], questionCount: 3, marksPerQuestion: 10 }]);
    if (b === "balanced") setSections([{ title: "Section A — Short answers", types: ["MCQ", "SHORT_ANSWER"], questionCount: 5, marksPerQuestion: 2 }, { title: "Section B — Theory", types: ["THEORY", "CONCEPTUAL"], questionCount: 3, marksPerQuestion: 5 }, { title: "Section C — Coding", types: ["SHORT_CODE", "LONG_CODE"], questionCount: 2, marksPerQuestion: 10 }]);
    if (b === "coding") setSections([{ title: "Section A — Output & debugging", types: ["OUTPUT_PREDICTION", "DEBUGGING"], questionCount: 4, marksPerQuestion: 3 }, { title: "Section B — Programs", types: ["SHORT_CODE", "PSEUDOCODE"], questionCount: 3, marksPerQuestion: 6 }, { title: "Section C — Problem solving", types: ["LONG_CODE", "PROBLEM_SOLVING"], questionCount: 2, marksPerQuestion: 15 }]);
  };
  const upd = (i: number, patch: Partial<SectionSpec>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const generate = async () => {
    if (!subjectId) return setError("Choose a subject.");
    if (sections.some((s) => !s.types.length || !s.title.trim())) return setError("Every section needs a title and at least one question type.");
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ paperId: string }>("/papers/generate", { method: "POST", body: { subjectId, title: title || undefined, topicIds, language: subject?.isCoding ? language || null : null, difficulty, durationMins: duration, sections, documentIds: docIds, instructions: instructions || null } });
      navigate(`/app/papers/${r.paperId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div>
      <PapersTabs />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Section title="Paper">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Subject">{(a) => <Select {...a} value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicIds([]); setDocIds([]); setLanguage(subjects.data?.find((s) => s.id === e.target.value)?.defaultLang ?? ""); }}><option value="">Choose a subject</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
                <Field label="Title (optional)">{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DBMS mock mid-sem" />}</Field>
              </div>
              {subject && subject.topics.length > 0 && <div><p className="mb-2 text-[13px] font-medium">Topics <span className="font-normal text-muted">(none = whole syllabus)</span></p><div className="flex flex-wrap gap-2">{subject.topics.map((t) => <Chip key={t.id} selected={topicIds.includes(t.id)} onClick={() => setTopicIds((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>{t.name}</Chip>)}</div></div>}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Difficulty">{(a) => <Select {...a} value={difficulty} onChange={(e) => setDifficulty(e.target.value as GeneratePaperInput["difficulty"])}><option value="MIXED">Mixed (exam-like)</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}</Select>}</Field>
                <Field label="Duration (min)">{(a) => <Input {...a} type="number" min={10} max={360} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />}</Field>
                {subject?.isCoding !== false && <Field label="Language">{(a) => <Select {...a} value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">Subject default</option>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}</Field>}
              </div>
              <div><p className="mb-2 text-[13px] font-medium">Theory / coding balance</p><Segmented ariaLabel="Balance" value={balance} onChange={applyBalance} options={[{ value: "theory", label: "Theory-heavy" }, { value: "balanced", label: "Balanced" }, { value: "coding", label: "Coding-heavy" }]} /></div>
            </div>
          </Section>
          <Section title={`Sections · ${total} marks total`} action={sections.length < 6 && <Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setSections([...sections, { title: `Section ${String.fromCharCode(65 + sections.length)}`, types: ["THEORY"], questionCount: 2, marksPerQuestion: 5 }])}>Add section</Button>}>
            <div className="space-y-4">
              {sections.map((s, i) => (
                <div key={i} className="rounded-md border border-line p-3">
                  <div className="flex gap-2">
                    <Input aria-label="Section title" value={s.title} onChange={(e) => upd(i, { title: e.target.value })} />
                    <Button size="icon" variant="ghost" aria-label="Remove section" disabled={sections.length === 1} onClick={() => setSections(sections.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Questions">{(a) => <Input {...a} type="number" min={1} max={30} value={s.questionCount} onChange={(e) => upd(i, { questionCount: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />}</Field>
                    <Field label="Marks each">{(a) => <Input {...a} type="number" min={1} max={50} value={s.marksPerQuestion} onChange={(e) => upd(i, { marksPerQuestion: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />}</Field>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{QUESTION_TYPES.map((t) => <Chip key={t} className="h-7 text-xs" selected={s.types.includes(t)} onClick={() => upd(i, { types: s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t] })}>{QUESTION_TYPE_LABEL[t as QuestionType]}</Chip>)}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
        <div className="space-y-5">
          <Section title="Reference material">
            <p className="mb-3 text-xs text-muted">The AI follows the topics, style and mark pattern of these, while writing new questions.</p>
            {docs.data && docs.data.length > 0 ? (
              <ul className="mb-3 space-y-1.5">{docs.data.filter((d) => !subjectId || !d.subject || d.subject.id === subjectId).map((d) => <li key={d.id}><Checkbox checked={docIds.includes(d.id)} disabled={d.extractionStatus !== "DONE"} onChange={() => setDocIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} label={<span className="text-sm">{d.originalName} <span className="text-xs text-muted">({d.kind.toLowerCase().replace(/_/g, " ")})</span></span>} /></li>)}</ul>
            ) : <p className="mb-3 text-sm text-muted">No materials yet.</p>}
            <Uploader subjectId={subjectId} onUploaded={(d) => setDocIds((x) => [...x, d.id])} />
          </Section>
          <Section title="Instructions">
            <Textarea aria-label="Extra instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Include one question on normalisation like Q4 of the 2023 paper." className="min-h-20" />
          </Section>
          <div className="rounded-lg border border-line bg-surface p-4">
            {!available && providers.data && <p className="mb-3 text-sm text-ink-2">Set up an AI provider first. <Link to="/app/settings/ai" className="text-accent hover:underline">AI settings</Link></p>}
            {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
            <Button className="w-full" size="lg" leftIcon={<Sparkles />} loading={busy} disabled={!available} onClick={() => void generate()}>{busy ? "Generating paper…" : `Generate ${total}-mark paper`}</Button>
            {busy && <p className="mt-2 text-center text-xs text-muted">Each section is generated and checked separately; this can take a minute or two.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PaperDetail {
  id: string;
  title: string;
  instructions: string | null;
  totalMarks: number;
  durationMins: number;
  createdAt: string;
  subject: { name: string };
  topics: { topic: { name: string } }[];
  materials: { document: { originalName: string } }[];
  sections: { id: string; title: string; instructions: string | null }[];
  questions: { id: string; sectionId: string | null; marks: number; question: { id: string; title: string; type: string; inLibrary: boolean } }[];
}

export function PaperDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["papers", id], queryFn: async () => (await api<{ paper: PaperDetail }>(`/papers/${id}`)).paper });
  const attempts = useQuery({ queryKey: ["papers", id, "attempts"], queryFn: async () => (await api<{ papers: PaperRow[] }>("/papers")).papers.find((p) => p.id === id)?.attempts ?? [] });
  const [mode, setMode] = useState<"EXAM" | "GUIDED">("EXAM");
  const [timing, setTiming] = useState<"END" | "IMMEDIATE">("END");
  const start = useMutation({ mutationFn: () => api<{ attemptId: string }>(`/papers/${id}/attempts`, { method: "POST", body: { mode, feedbackTiming: mode === "GUIDED" ? "IMMEDIATE" : timing } }), onSuccess: (r) => navigate(`/app/papers/attempts/${r.attemptId}`), onError: toast.error });
  const save = useMutation({ mutationFn: () => api<{ saved: number }>(`/papers/${id}/save-questions`, { method: "POST" }), onSuccess: (r) => { toast.success(`${r.saved} questions saved to your library.`); void qc.invalidateQueries({ queryKey: ["papers", id] }); }, onError: toast.error });
  const del = useMutation({ mutationFn: () => api(`/papers/${id}`, { method: "DELETE" }), onSuccess: () => { qc.removeQueries({ queryKey: ["papers", id] }); void qc.invalidateQueries({ queryKey: ["papers"], exact: true }); navigate("/app/papers"); }, onError: toast.error });

  return (
    <QueryView query={q}>
      {(p) => (
        <div>
          <PageHeader eyebrow={<Link to="/app/papers" className="hover:text-ink">← Practice papers</Link>} title={p.title} description={`${p.subject.name} · ${p.totalMarks} marks · ${p.durationMins} minutes · ${p.questions.length} questions`} actions={<Button variant="ghost" size="icon" aria-label="Delete paper" onClick={async () => { if (await confirm({ title: "Delete this paper?", body: "Its attempts are deleted. Questions you saved to the library are kept.", danger: true, confirmLabel: "Delete" })) del.mutate(); }}><Trash2 /></Button>} />
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Section title="Contents">
              <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">{p.instructions}</p>
              {p.sections.map((s) => (
                <div key={s.id} className="mb-4">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mb-1 text-xs text-muted">{s.instructions}</p>
                  <ol className="space-y-1">{p.questions.filter((x) => x.sectionId === s.id).map((x) => <li key={x.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{x.question.title}</span><span className="shrink-0 font-mono text-xs text-muted">{x.marks} m</span></li>)}</ol>
                </div>
              ))}
              {p.materials.length > 0 && <p className="text-xs text-muted">Based on: {p.materials.map((m) => m.document.originalName).join(", ")}</p>}
            </Section>
            <div className="space-y-5">
              <Section title="Solve">
                <div className="space-y-3">
                  <Segmented ariaLabel="Mode" value={mode} onChange={setMode} options={[{ value: "EXAM", label: "Exam mode" }, { value: "GUIDED", label: "Guided practice" }]} />
                  <p className="text-xs text-muted">{mode === "EXAM" ? `Timed (${p.durationMins} min). Navigate freely, flag for review, progress autosaves.` : "One question at a time with feedback after each answer."}</p>
                  {mode === "EXAM" && <Segmented ariaLabel="Feedback timing" value={timing} onChange={setTiming} options={[{ value: "END", label: "Evaluate at the end" }, { value: "IMMEDIATE", label: "Immediate feedback" }]} />}
                  <Button className="w-full" leftIcon={<Timer />} loading={start.isPending} onClick={() => start.mutate()}>Start</Button>
                </div>
              </Section>
              <Section title="Download">
                <div className="grid gap-2">
                  {[["questions", "Question paper"], ["answers", "Answer key"], ["full", "Paper with solutions & explanations"]].map(([v, l]) => <a key={v} href={`/api/papers/${p.id}/pdf?variant=${v}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:border-line-strong"><Download className="size-4 text-muted" />{l} (PDF)</a>)}
                </div>
                <Button className="mt-3 w-full" variant="secondary" leftIcon={<Library />} loading={save.isPending} onClick={() => save.mutate()}>Save questions to library</Button>
              </Section>
              <Section title="Attempts">
                {attempts.data?.length ? <ul className="space-y-2">{attempts.data.map((a) => <li key={a.id}><Link to={`/app/papers/attempts/${a.id}`} className="flex justify-between rounded-md border border-line px-3 py-2 text-sm hover:border-line-strong"><span>{fmtDateTime(a.startedAt)} · {a.mode.toLowerCase()}</span><span className="text-xs text-muted">{a.status === "IN_PROGRESS" ? "in progress" : `${a.score ?? 0}/${a.maxScore}`}</span></Link></li>)}</ul> : <p className="text-sm text-muted">Not attempted yet.</p>}
              </Section>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}

interface AttemptRow { id: string; mode: string; status: string; score: number | null; maxScore: number | null; startedAt: string; paper: { id: string; title: string; totalMarks: number; subject: { name: string } } }
export function PaperAttemptsPage() {
  const q = useQuery({ queryKey: ["papers", "attempts"], queryFn: async () => (await api<{ attempts: AttemptRow[] }>("/papers/attempts")).attempts });
  return (
    <div>
      <PapersTabs />
      <QueryView query={q}>
        {(rows) => rows.length === 0 ? <EmptyState icon={<Timer />} title="No attempts yet" description="Your paper attempts, marks and solutions will be listed here." /> : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {rows.map((r) => <li key={r.id}><Link to={`/app/papers/attempts/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{r.paper.title}</p><p className="text-xs text-muted">{r.paper.subject.name} · {r.mode === "EXAM" ? "Exam mode" : "Guided"} · {fmtDateTime(r.startedAt)}</p></div>{r.status === "IN_PROGRESS" ? <Badge tone="accent">in progress</Badge> : <span className="font-mono text-sm">{r.score ?? 0}/{r.maxScore}</span>}</Link></li>)}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
