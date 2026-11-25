import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, FileText, Pencil, Star, Trash2 } from "lucide-react";
import { languageLabel } from "@code-junk/shared";
import { Badge, Button, ButtonLink, Menu, MenuItem, QueryView, useConfirm, useToast } from "@/components/ui";
import { CodeEditor } from "@/components/code/CodeEditor";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { downloadPost } from "@/features/subjects/api";
import { useSnippet, useSnippetMutations } from "./api";

/** Booklet-style reading page: one snippet per page, with previous/next in booklet order. */
export default function SnippetViewPage() {
  const { id = "" } = useParams();
  const q = useSnippet(id);
  const m = useSnippetMutations();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <QueryView query={q}>
      {({ snippet: s, prev, next, pageNumber, pageCount }) => (
        <article>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <Link to={`/app/booklet/subjects/${s.subjectId}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> {s.subject.name}</Link>
            <span className="font-mono text-xs text-muted">page {pageNumber} of {pageCount}</span>
          </div>
          <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <Badge tone="accent">{languageLabel(s.language)}</Badge>
                <Link to={`/app/booklet/subjects/${s.subjectId}`} className="hover:underline">{s.subject.name}</Link>
                {s.topic && <><span>·</span><Link to={`/app/booklet?subjectId=${s.subjectId}&topicId=${s.topic.id}`} className="hover:underline">{s.topic.name}</Link></>}
                {s.collection && <><span>·</span><Link to={`/app/booklet?collectionId=${s.collection.id}`} className="hover:underline">{s.collection.name}</Link></>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" aria-pressed={s.isFavorite} leftIcon={<Star className={cn(s.isFavorite && "fill-mark-yellow text-mark-yellow")} />} onClick={() => m.update.mutate({ id: s.id, isFavorite: !s.isFavorite }, { onSuccess: () => toast.success(s.isFavorite ? "Removed from favourites." : "Added to favourites.") })}>
                {s.isFavorite ? "Favourite" : "Favourite"}
              </Button>
              <ButtonLink size="sm" to={`/app/booklet/snippets/${s.id}/edit`} leftIcon={<Pencil />}>Edit</ButtonLink>
              <Menu trigger={(p) => <Button size="sm" variant="ghost" {...p}>More</Button>}>
                {(close) => (
                  <>
                    <MenuItem icon={<Copy />} onClick={() => { close(); m.duplicate.mutate(s.id, { onSuccess: (r) => navigate(`/app/booklet/snippets/${r.snippet.id}`) }); }}>Duplicate</MenuItem>
                    <MenuItem icon={<Download />} onClick={() => { close(); window.location.href = `/api/snippets/${s.id}/download`; }}>Download source file</MenuItem>
                    <MenuItem icon={<FileText />} onClick={async () => { close(); setBusy(true); try { await downloadPost("/snippets/export", { ids: [s.id], format: "pdf" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed."); } finally { setBusy(false); } }}>Export as PDF</MenuItem>
                    <MenuItem icon={<Trash2 />} danger onClick={async () => { close(); if (await confirm({ title: `Delete “${s.title}”?`, body: "This snippet will be permanently deleted.", danger: true, confirmLabel: "Delete" })) m.remove.mutate(s.id, { onSuccess: () => navigate(`/app/booklet/subjects/${s.subjectId}`) }); }}>Delete</MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </header>
          {busy && <p className="mb-2 text-xs text-muted">Preparing PDF…</p>}
          {s.description && <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-ink-2">{s.description}</p>}
          <CodeEditor value={s.code} language={s.language} readOnly minHeight="120px" ariaLabel={`Code for ${s.title}`} />
          {s.notes && (
            <section className="mt-6">
              <h2 className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">Notes</h2>
              <div className="max-w-3xl rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">{s.notes}</div>
            </section>
          )}
          <footer className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
            {s.tags.map((t) => <Link key={t} to={`/app/booklet?tag=${encodeURIComponent(t)}`} className="rounded bg-surface-2 px-2 py-0.5 hover:text-ink">#{t}</Link>)}
            <span className="ml-auto">Created {fmtDateTime(s.createdAt)} · Updated {fmtDateTime(s.updatedAt)}</span>
          </footer>
          <nav aria-label="Booklet pages" className="mt-8 grid grid-cols-2 gap-3 border-t border-line pt-5">
            {prev ? (
              <Link to={`/app/booklet/snippets/${prev.id}`} className="rounded-lg border border-line p-3 hover:border-line-strong">
                <span className="flex items-center gap-1 text-xs text-muted"><ChevronLeft className="size-3.5" /> Previous</span>
                <span className="mt-0.5 block truncate text-sm font-medium">{prev.title}</span>
              </Link>
            ) : <span />}
            {next ? (
              <Link to={`/app/booklet/snippets/${next.id}`} className="rounded-lg border border-line p-3 text-right hover:border-line-strong">
                <span className="flex items-center justify-end gap-1 text-xs text-muted">Next <ChevronRight className="size-3.5" /></span>
                <span className="mt-0.5 block truncate text-sm font-medium">{next.title}</span>
              </Link>
            ) : <span />}
          </nav>
        </article>
      )}
    </QueryView>
  );
}
