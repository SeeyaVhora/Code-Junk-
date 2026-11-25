import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Sparkles, X } from "lucide-react";
import { DIFFICULTIES, DIFFICULTY_LABEL, LANGUAGES, LONG_MODE_TYPES, QUESTION_TYPES, QUESTION_TYPE_LABEL, SHORT_MODE_TYPES, type GenerateQuizInput, type QuestionType } from "@code-junk/shared";
import { Button, ButtonLink, Chip, EmptyState, Field, Input, PageHeader, Section, Segmented, Select, TabLinks, Textarea, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { useSubjects } from "@/features/subjects/api";
import { SubjectDialog } from "@/features/subjects/components";

export interface ProviderStatus {
  provider: "OPENAI" | "GEMINI";
  available: boolean;
  source: "own_key" | "server" | null;
  keyLast4: string | null;
  model: string;
}
export const useProviders = () => useQuery({ queryKey: ["ai", "providers"], queryFn: async () => (await api<{ providers: ProviderStatus[] }>("/ai/providers")).providers });

export function PracticeTabs() {
  return (
    <TabLinks
      className="mb-6"
      tabs={[
        { to: "/app/practice", label: "Generate", end: true },
        { to: "/app/practice/short", label: "Short mode" },
        { to: "/app/practice/long", label: "Long mode" },
        { to: "/app/practice/quizzes", label: "My quizzes" },
        { to: "/app/practice/history", label: "Practice history" },
      ]}
    />
  );
}

export default function GeneratePage({ initialMode = "SHORT" }: { initialMode?: "SHORT" | "LONG" }) {
  const subjects = useSubjects();
  const providers = useProviders();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"SHORT" | "LONG">(initialMode);
  const [subjectId, setSubjectId] = useState("");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState<GenerateQuizInput["difficulty"]>("INTERMEDIATE");
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<QuestionType[]>(SHORT_MODE_TYPES.slice(0, 3));
  const [provider, setProvider] = useState<"" | "OPENAI" | "GEMINI">("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newSubject, setNewSubject] = useState(false);

  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => {
    setTypes(mode === "SHORT" ? ["CONCEPTUAL", "MCQ", "OUTPUT_PREDICTION"] : ["LONG_CODE", "THEORY", "PROBLEM_SOLVING"]);
    setCount(mode === "SHORT" ? 5 : 3);
  }, [mode]);
  const subject = subjects.data?.find((s) => s.id === subjectId);
  useEffect(() => {
    if (!subjectId && subjects.data?.[0]) setSubjectId(subjects.data[0].id);
  }, [subjects.data, subjectId]);
  useEffect(() => {
    setTopicIds([]);
    setLanguage(subject?.defaultLang ?? "");
  }, [subjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = providers.data?.filter((p) => p.available) ?? [];
  const preferredTypes = mode === "SHORT" ? SHORT_MODE_TYPES : LONG_MODE_TYPES;
  const otherTypes = useMemo(() => QUESTION_TYPES.filter((t) => !preferredTypes.includes(t)), [preferredTypes]);

  const generate = async () => {
    if (!subjectId) return setError("Choose a subject.");
    if (!types.length) return setError("Choose at least one question type.");
    setError(null);
    setBusy(true);
    try {
      const body: GenerateQuizInput = { mode, subjectId, topicIds, customTopics: custom, language: subject?.isCoding ? ((language || null) as GenerateQuizInput["language"]) : null, difficulty, count, types, provider: provider || undefined, instructions: instructions || null };
      const { quizId } = await api<{ quizId: string }>("/quizzes/generate", { method: "POST", body });
      const { attemptId } = await api<{ attemptId: string }>(`/quizzes/${quizId}/attempts`, { method: "POST" });
      navigate(`/app/practice/attempts/${attemptId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="AI Practice" description="Generate personalised questions on exactly what you're learning, then answer them one at a time." />
      <PracticeTabs />
      {subjects.data && subjects.data.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Create a subject first" description="Questions are generated for a subject and its topics." action={<Button leftIcon={<Plus />} onClick={() => setNewSubject(true)}>New subject</Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Section title="What to practise">
            <div className="space-y-5">
              <Segmented ariaLabel="Mode" value={mode} onChange={setMode} options={[{ value: "SHORT", label: "Short mode · quick revision" }, { value: "LONG", label: "Long mode · deep practice" }]} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Subject">{(a) => <div className="flex gap-2"><Select {...a} className="flex-1" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Button variant="secondary" size="icon" aria-label="New subject" onClick={() => setNewSubject(true)}><Plus /></Button></div>}</Field>
                {subject?.isCoding !== false && <Field label="Programming language">{(a) => <Select {...a} value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">Subject default</option>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}</Field>}
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium">Topics <span className="font-normal text-muted">(none selected = whole subject)</span></p>
                <div className="flex flex-wrap gap-2">
                  {subject?.topics.map((t) => <Chip key={t.id} selected={topicIds.includes(t.id)} onClick={() => setTopicIds((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>{t.name}</Chip>)}
                  {custom.map((c) => <Chip key={c} selected onClick={() => setCustom((x) => x.filter((y) => y !== c))}>{c} <X className="size-3" /></Chip>)}
                </div>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = customDraft.trim(); if (v && !custom.includes(v)) setCustom([...custom, v]); setCustomDraft(""); }}>
                  <Input value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} placeholder="Add a custom topic (saved to the subject)" aria-label="Custom topic" className="h-9" maxLength={80} />
                  <Button type="submit" size="sm" variant="secondary">Add</Button>
                </form>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Difficulty">{(a) => <Select {...a} value={difficulty} onChange={(e) => setDifficulty(e.target.value as GenerateQuizInput["difficulty"])}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}<option value="MIXED">Mixed</option></Select>}</Field>
                <Field label="Number of questions" hint="1–25">{(a) => <Input {...a} type="number" min={1} max={25} value={count} onChange={(e) => setCount(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} />}</Field>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium">Question types</p>
                <div className="flex flex-wrap gap-2">
                  {[...preferredTypes, ...otherTypes].map((t) => <Chip key={t} selected={types.includes(t)} onClick={() => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{QUESTION_TYPE_LABEL[t]}</Chip>)}
                </div>
              </div>
              <Field label="Extra instructions (optional)">{(a) => <Textarea {...a} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="min-h-16" placeholder="e.g. Focus on nil pointer pitfalls" maxLength={1000} />}</Field>
            </div>
          </Section>
          <div className="space-y-5">
            <Section title="AI provider">
              {providers.isPending ? <p className="text-sm text-muted">Checking…</p> : available.length === 0 ? (
                <div className="space-y-3 text-sm">
                  <p className="flex items-start gap-2 text-ink-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-mark-yellow" /> No AI provider is set up yet. Add your OpenAI or Gemini API key to generate questions.</p>
                  <ButtonLink to="/app/settings/ai" size="sm" variant="secondary">Set up AI providers</ButtonLink>
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label="Provider">{(a) => <Select {...a} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}><option value="">My default</option>{available.map((p) => <option key={p.provider} value={p.provider}>{p.provider === "OPENAI" ? "OpenAI" : "Google Gemini"} · {p.model}</option>)}</Select>}</Field>
                  <ul className="space-y-1 text-xs text-muted">
                    {providers.data?.map((p) => <li key={p.provider}>{p.provider === "OPENAI" ? "OpenAI" : "Gemini"}: {p.available ? (p.source === "own_key" ? `your key ••••${p.keyLast4}` : "server key") : "not configured"}</li>)}
                  </ul>
                  <Link to="/app/settings/ai" className="text-xs text-accent hover:underline">Manage providers</Link>
                </div>
              )}
            </Section>
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm text-ink-2">{mode === "SHORT" ? "Short mode: quick conceptual questions, MCQs, output prediction and small coding tasks." : "Long mode: detailed theory, longer coding problems and multi-concept tasks with a code editor."}</p>
              {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
              <Button className="mt-4 w-full" size="lg" leftIcon={<Sparkles />} loading={busy} disabled={!available.length} onClick={() => void generate()}>
                {busy ? "Generating questions…" : `Generate ${count} question${count === 1 ? "" : "s"}`}
              </Button>
              {busy && <p className="mt-2 text-center text-xs text-muted">This usually takes 10–40 seconds.</p>}
            </div>
          </div>
        </div>
      )}
      {newSubject && <SubjectDialog open onClose={() => setNewSubject(false)} onCreated={(s) => setSubjectId(s.id)} />}
    </div>
  );
}
