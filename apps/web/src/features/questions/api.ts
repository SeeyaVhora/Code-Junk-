import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColorMark, QuestionInput } from "@code-junk/shared";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";

export interface QuestionLite {
  id: string;
  title: string;
  body: string;
  type: string;
  difficulty: string;
  language: string | null;
  source: string;
  sourceUrl: string | null;
  colorMark: ColorMark | null;
  isFavorite: boolean;
  isBookmarked: boolean;
  createdAt: string;
  subject: { id: string; name: string };
  topic: { id: string; name: string } | null;
  tags: string[];
  revisionItem: { nextReviewAt: string; status: string; lapses: number } | null;
}

export interface Submission {
  id: string;
  verdict: "CORRECT" | "PARTIAL" | "INCORRECT" | "UNGRADED";
  gradingMethod: "DETERMINISTIC" | "AI_RUBRIC" | "SELF_ASSESSED" | "TEST_CASES" | null;
  score: number | null;
  maxScore: number | null;
  answerText: string | null;
  selectedOptionIds: string[];
  feedback: string | null;
  mistakes: { location?: string | null; description: string }[] | null;
  criteriaResults: { criteria?: { criterion: string; met: string; comment?: string | null }[]; improvements?: string[]; concepts?: string[] } | null;
  suggestedMark: ColorMark | null;
  submittedAt: string;
}

export interface QuestionFull extends Omit<QuestionLite, "revisionItem"> {
  options: { id: string; text: string }[] | null;
  correctOptionIds: string[];
  expectedAnswer: string | null;
  solution: string | null;
  explanation: string | null;
  starterCode: string | null;
  concepts: string[];
  personalNotes: string | null;
  sourceAttribution: string | null;
  inLibrary: boolean;
  subjectId: string;
  topicId: string | null;
  submissions: Submission[];
  sourceDocument: { id: string; originalName: string } | null;
  revisionItem: { nextReviewAt: string; status: string; lapses: number; repetitions: number; totalReviews: number; intervalDays: number; reviews: { verdict: string; reviewedAt: string; newIntervalDays: number }[] } | null;
}

export interface QuestionFilters {
  q?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: string;
  type?: string;
  color?: string;
  source?: string;
  favorite?: boolean;
  incorrect?: boolean;
  sort?: string;
}

const qs = (f: object) =>
  Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export function useQuestionList(filters: QuestionFilters) {
  return useInfiniteQuery({
    queryKey: ["questions", "list", filters],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api<{ items: QuestionLite[]; nextCursor: string | null; total?: number }>(`/questions?${qs({ ...filters, cursor: pageParam || undefined })}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
}

export const useQuestionStats = () =>
  useQuery({ queryKey: ["questions", "stats"], queryFn: () => api<{ total: number; green: number; yellow: number; red: number; favorites: number; incorrect: number; subjects: number; imported: number; dueForRevision: number }>("/questions/stats") });

export const useQuestion = (id: string | undefined) =>
  useQuery({ queryKey: ["questions", "one", id], enabled: !!id, queryFn: async () => (await api<{ question: QuestionFull }>(`/questions/${id}`)).question });

export function useQuestionMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => {
    for (const k of ["questions", "revision", "dashboard", "attempt", "quizzes"]) void qc.invalidateQueries({ queryKey: [k] });
  };
  return {
    mark: useMutation({
      mutationFn: ({ id, colorMark }: { id: string; colorMark: ColorMark | null }) => api(`/questions/${id}/mark`, { method: "PATCH", body: { colorMark } }),
      onSuccess: invalidate,
      onError: toast.error,
    }),
    update: useMutation({ mutationFn: ({ id, ...b }: Partial<QuestionInput> & { id: string; inLibrary?: boolean }) => api(`/questions/${id}`, { method: "PATCH", body: b }), onSuccess: invalidate, onError: toast.error }),
    create: useMutation({ mutationFn: (b: QuestionInput) => api<{ question: { id: string } }>("/questions", { method: "POST", body: b }), onSuccess: () => { invalidate(); toast.success("Question saved to your library."); }, onError: toast.error }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/questions/${id}`, { method: "DELETE" }),
      onSuccess: (_d, id) => {
        qc.removeQueries({ queryKey: ["questions", "one", id] });
        void qc.invalidateQueries({ queryKey: ["questions"], predicate: (q) => !(q.queryKey[1] === "one" && q.queryKey[2] === id) });
        toast.success("Removed from your library.");
      },
      onError: toast.error,
    }),
  };
}

/** Starts a practice quiz from library questions and returns the new attempt id. */
export async function startPractice(body: { source: "incorrect" | "revision" | "questions"; questionIds?: string[]; subjectId?: string; limit?: number }) {
  const { quizId } = await api<{ quizId: string }>("/quizzes/practice", { method: "POST", body });
  const { attemptId } = await api<{ attemptId: string }>(`/quizzes/${quizId}/attempts`, { method: "POST" });
  return attemptId;
}
