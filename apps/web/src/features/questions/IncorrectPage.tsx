import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import { Badge, Button, EmptyState, QueryView, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, relative } from "@/lib/format";
import { startPractice } from "./api";

interface Item {
  id: string;
  title: string;
  type: string;
  options: { id: string; text: string }[] | null;
  correctOptionIds: string[];
  expectedAnswer: string | null;
  subject: { id: string; name: string };
  topic: { name: string } | null;
  revisionItem: { nextReviewAt: string; status: string } | null;
  lastAnswer: { verdict: string; answerText: string | null; selectedOptionIds: string[]; submittedAt: string } | null;
  wrongCount: number;
  attempts: number;
  lastAttemptedAt: string | null;
  resolved: boolean;
}

export default function IncorrectPage() {
  const q = useQuery({ queryKey: ["questions", "incorrect"], queryFn: async () => (await api<{ items: Item[] }>("/questions/incorrect")).items });
  const navigate = useNavigate();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    try {
      navigate(`/app/practice/attempts/${await startPractice({ source: "incorrect", limit: 20 })}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };
  const answerOf = (i: Item) => (i.lastAnswer?.selectedOptionIds.length ? i.lastAnswer.selectedOptionIds.map((id) => `${id}) ${i.options?.find((o) => o.id === id)?.text ?? ""}`).join(", ") : (i.lastAnswer?.answerText ?? "—"));
  const correctOf = (i: Item) => (i.correctOptionIds.length ? i.correctOptionIds.map((id) => `${id}) ${i.options?.find((o) => o.id === id)?.text ?? ""}`).join(", ") : (i.expectedAnswer ?? "See the solution"));

  return (
    <QueryView query={q}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="No incorrect questions" description="Questions you answer wrongly or partly appear here, with your answer and the correct one." />
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-ink-2">{items.filter((i) => !i.resolved).length} still wrong · {items.filter((i) => i.resolved).length} answered correctly since</p>
              <Button leftIcon={<Play />} loading={starting} onClick={() => void start()}>Practise incorrect questions</Button>
            </div>
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link to={`/app/library/questions/${i.id}`} className="font-medium hover:underline">{i.title}</Link>
                    {i.resolved ? <Badge tone="green">Now correct</Badge> : <Badge tone="red">{i.wrongCount}× wrong</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{i.subject.name}{i.topic ? ` · ${i.topic.name}` : ""} · {i.attempts} attempt{i.attempts === 1 ? "" : "s"}{i.lastAttemptedAt ? ` · last ${fmtDate(i.lastAttemptedAt)}` : ""}{i.revisionItem ? ` · next revision ${relative(i.revisionItem.nextReviewAt)}` : ""}</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-md bg-mark-red-soft/60 px-3 py-2"><p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-mark-red"><XCircle className="size-3.5" /> Your last answer</p><p className="line-clamp-3 font-mono text-[12.5px] whitespace-pre-wrap">{answerOf(i)}</p></div>
                    <div className="rounded-md bg-mark-green-soft/60 px-3 py-2"><p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-mark-green"><CheckCircle2 className="size-3.5" /> Correct answer</p><p className="line-clamp-3 font-mono text-[12.5px] whitespace-pre-wrap">{correctOf(i)}</p></div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </QueryView>
  );
}
