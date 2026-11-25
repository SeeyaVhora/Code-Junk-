import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Library, Play, Plus, Search, Star } from "lucide-react";
import { DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_SOURCE_LABEL, QUESTION_TYPES, QUESTION_TYPE_LABEL, type ColorMark, type QuestionSource, type QuestionType } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Checkbox, EmptyState, ErrorState, Input, LoadingBlock, Select, errorMessage, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import { useSubjects } from "@/features/subjects/api";
import { startPractice, useQuestionList, useQuestionMutations, type QuestionFilters } from "./api";
import { MarkPicker } from "./MarkPicker";

export type LibraryVariant = "all" | "green" | "yellow" | "red" | "favourites" | "imported";

export default function QuestionListPage({ variant = "all" }: { variant?: LibraryVariant }) {
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const m = useQuestionMutations();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setSelected(new Set()), [variant]);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k === "subjectId") n.delete("topicId");
    setParams(n, { replace: true });
  };
  const color = variant === "green" || variant === "yellow" || variant === "red" ? variant.toUpperCase() : undefined;
  const filters: QuestionFilters = {
    q: debounced || undefined,
    subjectId: params.get("subjectId") ?? undefined,
    topicId: params.get("topicId") ?? undefined,
    difficulty: params.get("difficulty") ?? undefined,
    type: params.get("type") ?? undefined,
    source: variant === "imported" ? undefined : (params.get("source") ?? undefined),
    color,
    favorite: variant === "favourites" || undefined,
    sort: params.get("sort") ?? "newest",
  };
  const list = useQuestionList(variant === "imported" ? { ...filters, source: params.get("source") ?? "IMPORTED_DOCUMENT" } : filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;
  const subject = subjects.data?.find((s) => s.id === filters.subjectId);

  const practise = async () => {
    setStarting(true);
    try {
      const attemptId = await startPractice({ source: "questions", questionIds: [...selected] });
      navigate(`/app/practice/attempts/${attemptId}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and notes" className="pl-9" aria-label="Search questions" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex">
          <Select aria-label="Subject" value={filters.subjectId ?? ""} onChange={(e) => set("subjectId", e.target.value)} className="lg:w-36"><option value="">All subjects</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select aria-label="Topic" value={filters.topicId ?? ""} onChange={(e) => set("topicId", e.target.value)} disabled={!subject} className="lg:w-32"><option value="">All topics</option>{subject?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select aria-label="Difficulty" value={filters.difficulty ?? ""} onChange={(e) => set("difficulty", e.target.value)} className="lg:w-32"><option value="">Any difficulty</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}</Select>
          <Select aria-label="Type" value={filters.type ?? ""} onChange={(e) => set("type", e.target.value)} className="lg:w-36"><option value="">Any type</option>{QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}</Select>
          <Select aria-label="Sort" value={filters.sort} onChange={(e) => set("sort", e.target.value)} className="lg:w-32"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="difficulty">Difficulty</option><option value="title">Title</option></Select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" leftIcon={<Play />} loading={starting} onClick={() => void practise()}>Practise these</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState description={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title={debounced || filters.subjectId || filters.type || filters.difficulty ? "No questions match" : color ? `No ${variant}-marked questions` : variant === "favourites" ? "No favourite questions" : variant === "imported" ? "No imported questions" : "Your question library is empty"}
          description={color ? "Mark questions green, yellow or red while practising, or from a question's page." : "Generate questions with AI and save them, write your own, or import a sample paper."}
          action={variant === "all" ? <div className="flex gap-2"><ButtonLink to="/app/practice" size="sm">Generate questions</ButtonLink><ButtonLink to="/app/library/new" size="sm" variant="secondary" leftIcon={<Plus />}>Write a question</ButtonLink></div> : undefined}
        />
      ) : (
        <>
          {total !== undefined && <p className="mb-2 text-xs text-muted">{total} question{total === 1 ? "" : "s"}</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {items.map((x) => (
              <li key={x.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", selected.has(x.id) && "bg-accent-soft/30")}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Checkbox aria-label={`Select ${x.title}`} className="mt-1" checked={selected.has(x.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />
                  <Link to={`/app/library/questions/${x.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:underline">{x.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge tone="outline" className="h-5">{QUESTION_TYPE_LABEL[x.type as QuestionType]}</Badge>
                      <Badge tone="neutral" className="h-5">{DIFFICULTY_LABEL[x.difficulty as keyof typeof DIFFICULTY_LABEL]}</Badge>
                      <span>{x.subject.name}{x.topic ? ` · ${x.topic.name}` : ""}</span>
                      {x.source !== "AI_GENERATED" && <span>· {QUESTION_SOURCE_LABEL[x.source as QuestionSource]}</span>}
                      {x.revisionItem && <span>· revise {relative(x.revisionItem.nextReviewAt)}</span>}
                    </div>
                  </Link>
                </div>
                <div className="flex items-center gap-1 pl-7 sm:pl-0">
                  <MarkPicker compact value={x.colorMark} onChange={(mark: ColorMark | null) => m.mark.mutate({ id: x.id, colorMark: mark })} />
                  <Button size="icon-sm" variant="ghost" aria-label={x.isFavorite ? "Unfavourite" : "Favourite"} onClick={() => m.update.mutate({ id: x.id, isFavorite: !x.isFavorite })}><Star className={cn(x.isFavorite && "fill-mark-yellow text-mark-yellow")} /></Button>
                </div>
              </li>
            ))}
          </ul>
          {list.hasNextPage && <div className="mt-4 text-center"><Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}
