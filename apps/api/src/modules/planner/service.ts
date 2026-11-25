import { prisma } from "../../lib/prisma.ts";
import type { UserCtx } from "../../lib/context.ts";
import { addDaysToKey, localDateKey, localWeekday, startOfLocalDay } from "../../lib/time.ts";

/**
 * Goal progress is always derived, never typed in: milestones when the goal has them,
 * otherwise its linked study sessions. A goal with neither reports null ("not measurable yet").
 */
export function goalProgress(g: {
  status: string;
  milestones: { completedAt: Date | null }[];
  sessions: { status: string }[];
}) {
  if (g.milestones.length) {
    const done = g.milestones.filter((m) => m.completedAt).length;
    return { pct: Math.round((done / g.milestones.length) * 100), basis: "milestones" as const, done, total: g.milestones.length };
  }
  const relevant = g.sessions.filter((s) => s.status !== "CANCELLED");
  if (relevant.length) {
    const done = relevant.filter((s) => s.status === "COMPLETED").length;
    return { pct: Math.round((done / relevant.length) * 100), basis: "sessions" as const, done, total: relevant.length };
  }
  return { pct: g.status === "COMPLETED" ? 100 : null, basis: "none" as const, done: 0, total: 0 };
}

/** Occurrence start times for a recurring session, keeping the same local wall-clock time. */
export function occurrences(first: Date, tz: string, recurrence: "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY", untilKey: string | null | undefined, max = 120) {
  if (recurrence === "NONE" || !untilKey) return [first];
  const firstKey = localDateKey(first, tz);
  const minutesIntoDay = Math.round((first.getTime() - startOfLocalDay(firstKey, tz).getTime()) / 60_000);
  const out: Date[] = [];
  for (let i = 0; out.length < max; i += recurrence === "WEEKLY" ? 7 : 1) {
    const key = addDaysToKey(firstKey, i);
    if (key > untilKey) break;
    const start = new Date(startOfLocalDay(key, tz).getTime() + minutesIntoDay * 60_000);
    if (recurrence === "WEEKDAYS") {
      const wd = localWeekday(start, tz);
      if (wd === 0 || wd === 6) continue;
    }
    out.push(start);
  }
  return out;
}

/** Replaces a session's or event's reminders. Fire times in the past are skipped. */
export async function setReminders(userId: string, target: { sessionId?: string; eventId?: string }, startsAt: Date, offsets: number[]) {
  await prisma.reminder.deleteMany({ where: { userId, ...target, sentAt: null } });
  const now = Date.now();
  const rows = [...new Set(offsets)]
    .map((offsetMins) => ({ offsetMins, fireAt: new Date(startsAt.getTime() - offsetMins * 60_000) }))
    .filter((r) => r.fireAt.getTime() > now);
  if (rows.length) await prisma.reminder.createMany({ data: rows.map((r) => ({ userId, ...target, ...r, channels: ["IN_APP" as const] })) });
}

/** Seconds studied so far, including the currently running stretch. */
export function elapsedNow(s: { elapsedSecs: number; runningSince: Date | null }) {
  return s.elapsedSecs + (s.runningSince ? Math.max(0, Math.round((Date.now() - s.runningSince.getTime()) / 1000)) : 0);
}

/** A goal with study activity moves from NOT_STARTED to IN_PROGRESS automatically. */
export async function touchGoal(goalId: string | null | undefined) {
  if (!goalId) return;
  await prisma.learningGoal.updateMany({ where: { id: goalId, status: "NOT_STARTED" }, data: { status: "IN_PROGRESS" } });
}

export async function notifyGoalCompleted(ctx: UserCtx, goal: { id: string; title: string }) {
  await prisma.notification.upsert({
    where: { userId_dedupeKey: { userId: ctx.userId, dedupeKey: `goal-done:${goal.id}` } },
    create: { userId: ctx.userId, kind: "goal_completed", title: "Goal completed", body: goal.title, link: `/app/planner/goals/${goal.id}`, dedupeKey: `goal-done:${goal.id}` },
    update: {},
  });
}
