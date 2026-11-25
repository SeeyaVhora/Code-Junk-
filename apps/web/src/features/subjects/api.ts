import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubjectInput } from "@code-junk/shared";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";

export interface TopicLite {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
}
export interface Subject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isCoding: boolean;
  defaultLang: string | null;
  topics: TopicLite[];
  _count: { snippets: number; questions: number; collections: number };
}
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  subjectId: string;
  subject: { id: string; name: string };
  _count: { snippets: number };
}

export const subjectsKey = ["subjects"] as const;

export function useSubjects() {
  return useQuery({ queryKey: subjectsKey, queryFn: async () => (await api<{ subjects: Subject[] }>("/subjects")).subjects });
}
export function useCollections() {
  return useQuery({ queryKey: ["collections"], queryFn: async () => (await api<{ collections: Collection[] }>("/collections")).collections });
}

/** Invalidate everything that shows subject/topic data after a change. */
export function useInvalidateTaxonomy() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: subjectsKey });
    void qc.invalidateQueries({ queryKey: ["subject"] });
    void qc.invalidateQueries({ queryKey: ["collections"] });
    void qc.invalidateQueries({ queryKey: ["snippets"] });
  };
}

export function useSubjectMutations() {
  const toast = useToast();
  const invalidate = useInvalidateTaxonomy();
  const opts = <T,>(msg: string) => ({ onSuccess: (_: T) => { invalidate(); toast.success(msg); }, onError: toast.error });
  return {
    create: useMutation({ mutationFn: (b: SubjectInput) => api<{ subject: Subject }>("/subjects", { method: "POST", body: b }), ...opts("Subject created.") }),
    update: useMutation({ mutationFn: ({ id, ...b }: Partial<SubjectInput> & { id: string }) => api(`/subjects/${id}`, { method: "PATCH", body: b }), ...opts("Subject updated.") }),
    remove: useMutation({ mutationFn: (id: string) => api(`/subjects/${id}`, { method: "DELETE" }), ...opts("Subject deleted.") }),
    addTopic: useMutation({ mutationFn: ({ subjectId, name }: { subjectId: string; name: string }) => api(`/subjects/${subjectId}/topics`, { method: "POST", body: { name } }), ...opts("Topic added.") }),
    renameTopic: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api(`/topics/${id}`, { method: "PATCH", body: { name } }), ...opts("Topic renamed.") }),
    removeTopic: useMutation({ mutationFn: (id: string) => api(`/topics/${id}`, { method: "DELETE" }), ...opts("Topic deleted.") }),
    reorderTopics: useMutation({ mutationFn: ({ subjectId, ids }: { subjectId: string; ids: string[] }) => api(`/subjects/${subjectId}/topics/reorder`, { method: "POST", body: { ids } }), ...opts("Order saved.") }),
    createCollection: useMutation({ mutationFn: (b: { name: string; subjectId: string; description?: string | null }) => api("/collections", { method: "POST", body: b }), ...opts("Collection created.") }),
    updateCollection: useMutation({ mutationFn: ({ id, ...b }: { id: string; name?: string; description?: string | null }) => api(`/collections/${id}`, { method: "PATCH", body: b }), ...opts("Collection updated.") }),
    removeCollection: useMutation({ mutationFn: (id: string) => api(`/collections/${id}`, { method: "DELETE" }), ...opts("Collection deleted.") }),
  };
}

/** Downloads a POSTed export (zip/pdf) through fetch, so CSRF and cookies apply. */
export async function downloadPost(path: string, body: unknown) {
  const csrf = document.cookie.match(/(?:^|;\s*)(?:__Host-)?cj_csrf=([^;]+)/)?.[1];
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? "Export failed.");
  }
  const blob = await res.blob();
  const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name ? decodeURIComponent(name) : "export";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
