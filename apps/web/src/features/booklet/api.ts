import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SnippetInput } from "@code-junk/shared";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";

export interface Snippet {
  id: string;
  title: string;
  description: string | null;
  language: string;
  code: string;
  notes: string | null;
  isFavorite: boolean;
  subjectId: string;
  topicId: string | null;
  collectionId: string | null;
  subject: { id: string; name: string };
  topic: { id: string; name: string } | null;
  collection: { id: string; name: string } | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface SnippetFilters {
  q?: string;
  subjectId?: string;
  topicId?: string;
  collectionId?: string;
  language?: string;
  favorite?: boolean;
  tag?: string;
  sort?: "updated" | "created" | "title" | "opened" | "booklet";
}

const qs = (f: object) =>
  Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export function useSnippetList(filters: SnippetFilters) {
  return useInfiniteQuery({
    queryKey: ["snippets", "list", filters],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api<{ items: Snippet[]; nextCursor: string | null; total?: number }>(`/snippets?${qs({ ...filters, cursor: pageParam || undefined })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSnippetStats() {
  return useQuery({ queryKey: ["snippets", "stats"], queryFn: () => api<{ snippets: number; subjects: number; collections: number; favorites: number; languages: { language: string; count: number }[] }>("/snippets/stats") });
}

export function useSnippet(id: string | undefined) {
  return useQuery({
    queryKey: ["snippets", "one", id],
    enabled: !!id,
    queryFn: () => api<{ snippet: Snippet; prev: { id: string; title: string } | null; next: { id: string; title: string } | null; pageNumber: number; pageCount: number }>(`/snippets/${id}`),
  });
}

export function useSnippetMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["snippets"] });
    void qc.invalidateQueries({ queryKey: ["subjects"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: SnippetInput) => api<{ snippet: Snippet }>("/snippets", { method: "POST", body: b }), onSuccess: () => { invalidate(); toast.success("Snippet saved."); }, onError: toast.error }),
    update: useMutation({ mutationFn: ({ id, ...b }: Partial<SnippetInput> & { id: string }) => api<{ snippet: Snippet }>(`/snippets/${id}`, { method: "PATCH", body: b }), onSuccess: invalidate, onError: toast.error }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/snippets/${id}`, { method: "DELETE" }),
      onSuccess: (_d, id) => {
        // Don't refetch the snippet that was just deleted (it would 404).
        qc.removeQueries({ queryKey: ["snippets", "one", id] });
        void qc.invalidateQueries({ queryKey: ["snippets"], predicate: (q) => !(q.queryKey[1] === "one" && q.queryKey[2] === id) });
        void qc.invalidateQueries({ queryKey: ["subjects"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success("Snippet deleted.");
      },
      onError: toast.error,
    }),
    duplicate: useMutation({ mutationFn: (id: string) => api<{ snippet: Snippet }>(`/snippets/${id}/duplicate`, { method: "POST" }), onSuccess: () => { invalidate(); toast.success("Snippet duplicated."); }, onError: toast.error }),
  };
}
