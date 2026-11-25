import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";

export interface PlannerSession {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  plannedMins: number;
  actualMins: number | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "SKIPPED" | "RESCHEDULED" | "CANCELLED";
  priority: string;
  elapsedSecs: number;
  runningSince: string | null;
  isOverdue: boolean;
  seriesId: string | null;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  milestone: { id: string; title: string } | null;
}
export interface Goal {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  targetDate: string | null;
  estimatedMins: number | null;
  completedAt: string | null;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
  milestones: { id: string; title: string; completedAt: string | null }[];
  progress: { pct: number | null; basis: "milestones" | "sessions" | "none"; done: number; total: number };
}

export const plannerKey = ["planner"] as const;

export function useInvalidatePlanner() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["planner", "dashboard", "calendar"]) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useSessionActions() {
  const toast = useToast();
  const invalidate = useInvalidatePlanner();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "start" | "pause" | "complete" | "reschedule" | "cancel"; body?: object }) =>
      api<{ session: PlannerSession }>(`/planner/sessions/${id}/${action}`, { method: "POST", body: body ?? {} }),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success({ start: "Timer started.", pause: "Paused.", complete: "Session completed.", reschedule: "Session rescheduled.", cancel: "Session cancelled." }[v.action]);
    },
    onError: toast.error,
  });
}

export const useOverview = () =>
  useQuery({
    queryKey: [...plannerKey, "overview"],
    queryFn: () =>
      api<{
        today: PlannerSession[];
        week: { startKey: string; sessions: PlannerSession[]; plannedMins: number; actualMins: number };
        overdue: PlannerSession[];
        upcoming: PlannerSession[];
        activeGoals: Goal[];
        completedGoals: Goal[];
      }>("/planner/overview"),
  });

export const useGoals = () => useQuery({ queryKey: [...plannerKey, "goals"], queryFn: async () => (await api<{ goals: Goal[] }>("/planner/goals")).goals });
