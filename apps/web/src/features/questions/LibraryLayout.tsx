import { useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus } from "lucide-react";
import { Button, ButtonLink, Dialog, Field, PageHeader, Select, StatTile, TabLinks, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useSubjects } from "@/features/subjects/api";
import { useQuestionStats } from "./api";

export default function LibraryLayout() {
  const s = useQuestionStats().data;
  const [importing, setImporting] = useState(false);
  return (
    <div>
      <PageHeader
        title="Question Library"
        description="Every question you want to keep: from AI quizzes, papers, your notes and coding platforms."
        actions={
          <>
            <Button variant="secondary" leftIcon={<FileUp />} onClick={() => setImporting(true)}>Import from document</Button>
            <ButtonLink to="/app/library/new" leftIcon={<Plus />}>New question</ButtonLink>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Questions" value={s?.total ?? "–"} hint={s ? `${s.subjects} subject${s.subjects === 1 ? "" : "s"}` : undefined} />
        <StatTile label="To revise" value={s?.dueForRevision ?? "–"} />
        <StatTile label="Incorrect" value={s?.incorrect ?? "–"} />
        <StatTile label="Red / Yellow" value={s ? `${s.red} / ${s.yellow}` : "–"} />
        <StatTile label="Favourites" value={s?.favorites ?? "–"} />
      </div>
      <TabLinks
        className="mb-5"
        tabs={[
          { to: "/app/library", label: "All", end: true, count: s?.total },
          { to: "/app/library/marked/green", label: "Green", count: s?.green },
          { to: "/app/library/marked/yellow", label: "Yellow", count: s?.yellow },
          { to: "/app/library/marked/red", label: "Red", count: s?.red },
          { to: "/app/library/incorrect", label: "Incorrect", count: s?.incorrect },
          { to: "/app/library/favourites", label: "Favourites", count: s?.favorites },
          { to: "/app/library/imported", label: "Imported", count: s?.imported },
        ]}
      />
      <Outlet />
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/** Upload a sample paper or notes and let the AI pull out the questions it contains. */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const subjects = useSubjects();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState("SAMPLE_PAPER");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!subjectId) return setError("Choose a subject.");
    if (!file) return setError("Choose a PDF or text file.");
    setError(null);
    try {
      setBusy("Uploading…");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("subjectId", subjectId);
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)cj_csrf=([^;]+)/)?.[1] ?? "");
      const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "same-origin", headers: { "x-csrf-token": csrf } });
      const up = (await res.json()) as { document?: { id: string }; warning?: string | null; error?: { message: string } };
      if (!res.ok || !up.document) throw new Error(up.error?.message ?? "Upload failed.");
      if (up.warning) throw new Error(up.warning);
      setBusy("Extracting questions with AI… this can take a minute.");
      const r = await api<{ imported: number }>(`/documents/${up.document.id}/import-questions`, { method: "POST", body: { subjectId } });
      toast.success(`Imported ${r.imported} question${r.imported === 1 ? "" : "s"}.`);
      void qc.invalidateQueries({ queryKey: ["questions"] });
      onClose();
      navigate("/app/library/imported");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Import questions from a document" description="Upload a sample paper, past paper or notes (PDF or text). The AI copies out the questions it contains, with answers where given." footer={<><Button variant="secondary" disabled={!!busy} onClick={onClose}>Cancel</Button><Button loading={!!busy} onClick={() => void run()}>Import</Button></>}>
      <div className="space-y-4">
        <Field label="Subject">{(a) => <Select {...a} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Choose a subject</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="Document type">{(a) => <Select {...a} value={kind} onChange={(e) => setKind(e.target.value)}><option value="SAMPLE_PAPER">Sample paper</option><option value="PREVIOUS_YEAR_PAPER">Previous-year paper</option><option value="REFERENCE">Notes / reference</option></Select>}</Field>
        <div>
          <input ref={ref} type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" leftIcon={<FileUp />} onClick={() => ref.current?.click()}>{file ? file.name : "Choose file (max 10 MB)"}</Button>
        </div>
        {busy && <p className="text-sm text-ink-2" role="status">{busy}</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
