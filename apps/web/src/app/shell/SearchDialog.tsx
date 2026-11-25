import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Dialog, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

interface Result {
  q: string;
  groups: { type: string; label: string; items: { id: string; title: string; meta: string; href: string }[] }[];
}

/** Global search across every module (server-side), grouped by type. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const res = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<Result>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2,
  });
  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Search Code Junk" size="lg">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Snippets, questions, topics, papers, goals, events…"
          aria-label="Search"
          className="h-11 w-full rounded-md border border-line bg-paper pr-3 pl-9 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="mt-4 min-h-24">
        {debounced.length < 2 ? (
          <p className="text-sm text-muted">Type at least two characters.</p>
        ) : res.isPending ? (
          <Spinner label="Searching" />
        ) : res.isError ? (
          <p className="text-sm text-danger">Search failed. Try again.</p>
        ) : res.data.groups.length === 0 ? (
          <p className="text-sm text-muted">Nothing matches “{debounced}”.</p>
        ) : (
          <div className="space-y-4">
            {res.data.groups.map((g) => (
              <div key={g.type}>
                <p className="mb-1 font-mono text-[11px] text-muted uppercase">{g.label}</p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => go(i.href)} className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2">
                        <span className="truncate text-ink">{i.title}</span>
                        <span className="shrink-0 text-xs text-muted">{i.meta}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
