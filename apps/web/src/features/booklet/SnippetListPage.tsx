import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BookOpen, Download, FileArchive, FileText, Plus, Search, Star } from "lucide-react";
import { LANGUAGES, languageLabel } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Checkbox, EmptyState, ErrorState, Input, LoadingBlock, Select, errorMessage, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, relative } from "@/lib/format";
import { downloadPost, useCollections, useSubjects } from "@/features/subjects/api";
import { useSnippetList, useSnippetMutations, type SnippetFilters } from "./api";

export default function SnippetListPage({ variant = "all" }: { variant?: "all" | "favourites" | "recent" }) {
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const collections = useCollections();
  const toast = useToast();
  const m = useSnippetMutations();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "subjectId") next.delete("topicId");
    setParams(next, { replace: true });
  };
  const filters: SnippetFilters = {
    q: debounced || undefined,
    subjectId: params.get("subjectId") ?? undefined,
    topicId: params.get("topicId") ?? undefined,
    collectionId: params.get("collectionId") ?? undefined,
    language: params.get("language") ?? undefined,
    tag: params.get("tag") ?? undefined,
    favorite: variant === "favourites" ? true : undefined,
    sort: variant === "recent" ? "updated" : ((params.get("sort") as SnippetFilters["sort"]) ?? "updated"),
  };
  const list = useSnippetList(filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;
  const subject = subjects.data?.find((s) => s.id === filters.subjectId);
  const collection = collections.data?.find((c) => c.id === filters.collectionId);
  const filtered = !!(filters.q || filters.subjectId || filters.language || filters.collectionId || filters.tag);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doExport = async (format: "zip" | "pdf") => {
    setExporting(format);
    try {
      await downloadPost("/snippets/export", { ids: [...selected], format });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, code, descriptions and notes" className="pl-9" aria-label="Search snippets" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
          <Select aria-label="Subject" value={filters.subjectId ?? ""} onChange={(e) => set("subjectId", e.target.value)} className="lg:w-40">
            <option value="">All subjects</option>
            {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Topic" value={filters.topicId ?? ""} onChange={(e) => set("topicId", e.target.value)} disabled={!subject} className="lg:w-36">
            <option value="">All topics</option>
            {subject?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select aria-label="Language" value={filters.language ?? ""} onChange={(e) => set("language", e.target.value)} className="lg:w-36">
            <option value="">All languages</option>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
          {variant === "all" && (
            <Select aria-label="Sort" value={filters.sort} onChange={(e) => set("sort", e.target.value)} className="lg:w-40">
              <option value="updated">Recently edited</option>
              <option value="created">Newest</option>
              <option value="title">Title A–Z</option>
              <option value="booklet">Booklet order</option>
            </Select>
          )}
        </div>
      </div>

      {(collection || filters.tag) && (
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {collection && <Badge tone="accent">Collection: {collection.name} <button aria-label="Clear collection" onClick={() => set("collectionId", "")}>×</button></Badge>}
          {filters.tag && <Badge tone="accent">#{filters.tag} <button aria-label="Clear tag" onClick={() => set("tag", "")}>×</button></Badge>}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="secondary" leftIcon={<FileArchive />} loading={exporting === "zip"} onClick={() => void doExport("zip")}>Download ZIP</Button>
          <Button size="sm" variant="secondary" leftIcon={<FileText />} loading={exporting === "pdf"} onClick={() => void doExport("pdf")}>Export PDF</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState description={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Search />} title="No snippets match" description="Try a different search or clear the filters." action={<Button variant="secondary" size="sm" onClick={() => { setQ(""); setParams({}, { replace: true }); }}>Clear filters</Button>} />
        ) : variant === "favourites" ? (
          <EmptyState icon={<Star />} title="No favourites yet" description="Star a snippet to keep it here for quick access." />
        ) : (
          <EmptyState icon={<BookOpen />} title="No code snippets yet" description="Start building your personal code booklet." action={<ButtonLink to="/app/booklet/new" leftIcon={<Plus />}>Add first snippet</ButtonLink>} />
        )
      ) : (
        <>
          {total !== undefined && <p className="mb-2 text-xs text-muted">{total} snippet{total === 1 ? "" : "s"}</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {items.map((s) => (
              <li key={s.id} className={cn("flex items-start gap-3 px-4 py-3", selected.has(s.id) && "bg-accent-soft/30")}>
                <Checkbox aria-label={`Select ${s.title}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="mt-1" />
                <Link to={`/app/booklet/snippets/${s.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink hover:underline">{s.title}</p>
                    {s.isFavorite && <Star className="size-3.5 shrink-0 fill-mark-yellow text-mark-yellow" aria-label="Favourite" />}
                  </div>
                  {s.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-2">{s.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Badge tone="outline" className="h-5">{languageLabel(s.language)}</Badge>
                    <span>{s.subject.name}{s.topic ? ` · ${s.topic.name}` : ""}</span>
                    {s.tags.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}
                    <span className="ml-auto" title={fmtDate(s.updatedAt)}>edited {relative(s.updatedAt)}</span>
                  </div>
                </Link>
                <Button size="icon-sm" variant="ghost" aria-label={s.isFavorite ? "Remove from favourites" : "Add to favourites"} onClick={() => m.update.mutate({ id: s.id, isFavorite: !s.isFavorite })}>
                  <Star className={cn(s.isFavorite && "fill-mark-yellow text-mark-yellow")} />
                </Button>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="mt-4 text-center">
              <Button variant="secondary" loading={list.isFetchingNextPage} leftIcon={<Download />} onClick={() => void list.fetchNextPage()}>Load more</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
