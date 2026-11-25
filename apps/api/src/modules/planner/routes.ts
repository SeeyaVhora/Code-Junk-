import {
  focusInput,
  goalInput,
  goalPatch,
  milestoneInput,
  milestonePatch,
  sessionComplete,
  sessionInput,
  sessionPatch,
  sessionReschedule,
} from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { assertOwned, assertTopicInSubject, logActivity, type UserCtx } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { dateColumn, localDayRange, localWeekRange } from "../../lib/time.ts";
import { elapsedNow, goalProgress, notifyGoalCompleted, occurrences, setReminders, touchGoal } from "./service.ts";

const goalInclude = {
  subject: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  milestones: { orderBy: { position: "asc" } },
  sessions: { select: { id: true, status: true, startsAt: true, plannedMins: true, actualMins: true } },
} satisfies Prisma.LearningGoalInclude;
type GoalRow = Prisma.LearningGoalGetPayload<{ include: typeof goalInclude }>;
const presentGoal = (g: GoalRow) => ({ ...g, progress: goalProgress(g) });

const sessionInclude = {
  subject: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  goal: { select: { id: true, title: true } },
  milestone: { select: { id: true, title: true } },
} satisfies Prisma.LearningSessionInclude;
type SessionRow = Prisma.LearningSessionGetPayload<{ include: typeof sessionInclude }>;
const presentSession = (s: SessionRow) => ({ ...s, elapsedSecs: elapsedNow(s), isOverdue: s.status === "SCHEDULED" && s.startsAt.getTime() + s.plannedMins * 60_000 < Date.now() });

async function checkSessionRefs(userId: string, s: { subjectId?: string | null; topicId?: string | null; goalId?: string | null; milestoneId?: string | null }) {
  await assertOwned("subject", userId, s.subjectId, "Subject");
  if (s.topicId) {
    if (!s.subjectId) throw badRequest("Choose the subject for this topic.");
    await assertTopicInSubject(userId, s.topicId, s.subjectId);
  }
  await assertOwned("learningGoal", userId, s.goalId, "Goal");
  if (s.milestoneId) {
    const m = await prisma.learningMilestone.findFirst({ where: { id: s.milestoneId, userId } });
    if (!m || (s.goalId && m.goalId !== s.goalId)) throw notFound("Milestone not found for this goal.");
  }
}

async function syncGoalDeadline(userId: string, goal: { id: string; title: string; targetDate: Date | null; subjectId: string | null }) {
  const existing = await prisma.calendarEvent.findFirst({ where: { userId, goalId: goal.id, category: "LEARNING_DEADLINE" } });
  if (!goal.targetDate) {
    if (existing) await prisma.calendarEvent.delete({ where: { id: existing.id } });
    return;
  }
  const data = { title: `Goal: ${goal.title}`.slice(0, 160), startsAt: goal.targetDate, allDay: true, subjectId: goal.subjectId };
  if (existing) await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  else await prisma.calendarEvent.create({ data: { ...data, userId, goalId: goal.id, category: "LEARNING_DEADLINE" } });
}

async function loadSession(userId: string, id: string) {
  const s = await prisma.learningSession.findFirst({ where: { id, userId }, include: sessionInclude });
  if (!s) throw notFound("Study session not found.");
  return s;
}

async function finishTimer(ctx: UserCtx, s: SessionRow, actualMins?: number) {
  const secs = actualMins !== undefined ? actualMins * 60 : elapsedNow(s);
  const now = new Date();
  const updated = await prisma.learningSession.update({
    where: { id: s.id },
    data: { status: "COMPLETED", completedAt: now, runningSince: null, elapsedSecs: secs, actualMins: Math.round(secs / 60) },
    include: sessionInclude,
  });
  if (secs > 0) {
    await prisma.focusSession.create({
      data: { userId: ctx.userId, sessionId: s.id, subjectId: s.subjectId, label: s.title, startedAt: new Date(now.getTime() - secs * 1000), endedAt: now, durationSecs: secs },
    });
  }
  // Completing a session tied to a milestone ticks the milestone off.
  if (s.milestoneId) await prisma.learningMilestone.updateMany({ where: { id: s.milestoneId, completedAt: null }, data: { completedAt: now } });
  await touchGoal(s.goalId);
  await prisma.reminder.deleteMany({ where: { sessionId: s.id, sentAt: null } });
  await logActivity(ctx, "session.completed", { type: "session", id: s.id }, { minutes: Math.round(secs / 60) });
  return updated;
}

export function plannerRouter() {
  const r = authedRouter();

  /** Planner dashboard: today, this week, overdue, upcoming and goals. */
  r.get("/overview", async (ctx) => {
    const now = new Date();
    const day = localDayRange(now, ctx.tz);
    const week = localWeekRange(now, ctx.tz, ctx.weekStartsOn);
    const [today, weekSessions, overdue, upcoming, goals] = await Promise.all([
      prisma.learningSession.findMany({ where: { userId: ctx.userId, startsAt: { gte: day.start, lt: day.end }, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, include: sessionInclude }),
      prisma.learningSession.findMany({ where: { userId: ctx.userId, startsAt: { gte: week.start, lt: week.end }, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, include: sessionInclude }),
      prisma.learningSession.findMany({ where: { userId: ctx.userId, status: { in: ["SCHEDULED", "PAUSED"] }, startsAt: { lt: day.start } }, orderBy: { startsAt: "desc" }, take: 30, include: sessionInclude }),
      prisma.learningSession.findMany({ where: { userId: ctx.userId, status: "SCHEDULED", startsAt: { gte: day.end } }, orderBy: { startsAt: "asc" }, take: 10, include: sessionInclude }),
      prisma.learningGoal.findMany({ where: { userId: ctx.userId }, orderBy: [{ status: "asc" }, { targetDate: "asc" }], include: goalInclude }),
    ]);
    const planned = weekSessions.reduce((s, x) => s + x.plannedMins, 0);
    const actual = weekSessions.filter((x) => x.status === "COMPLETED").reduce((s, x) => s + (x.actualMins ?? 0), 0);
    return {
      today: today.map(presentSession),
      week: { startKey: week.startKey, sessions: weekSessions.map(presentSession), plannedMins: planned, actualMins: actual },
      overdue: overdue.map(presentSession),
      upcoming: upcoming.map(presentSession),
      activeGoals: goals.filter((g) => g.status === "NOT_STARTED" || g.status === "IN_PROGRESS").map(presentGoal),
      completedGoals: goals.filter((g) => g.status === "COMPLETED").map(presentGoal),
    };
  });

  // ── Goals ──
  r.get("/goals", async ({ userId }, req) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const goals = await prisma.learningGoal.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: [{ status: "asc" }, { targetDate: "asc" }, { createdAt: "desc" }],
      include: goalInclude,
    });
    return { goals: goals.map(presentGoal) };
  });

  r.get("/goals/:id", async ({ userId }, req) => {
    const g = await prisma.learningGoal.findFirst({
      where: { id: param(req, "id"), userId },
      include: { ...goalInclude, sessions: { orderBy: { startsAt: "asc" }, include: sessionInclude } },
    });
    if (!g) throw notFound("Goal not found.");
    return { goal: { ...g, progress: goalProgress(g), sessions: g.sessions.map(presentSession) } };
  });

  r.post("/goals", async (ctx, req) => {
    const { milestones, ...input } = goalInput.parse(req.body);
    await checkSessionRefs(ctx.userId, { subjectId: input.subjectId, topicId: input.topicId });
    const g = await prisma.learningGoal.create({
      data: {
        ...input,
        targetDate: input.targetDate ? dateColumn(input.targetDate) : null,
        userId: ctx.userId,
        milestones: { create: milestones.map((title, position) => ({ title, position, userId: ctx.userId })) },
      },
      include: goalInclude,
    });
    await syncGoalDeadline(ctx.userId, g);
    return { goal: presentGoal(g) };
  });

  r.patch("/goals/:id", async (ctx, req) => {
    const id = param(req, "id");
    const input = goalPatch.parse(req.body);
    const existing = await prisma.learningGoal.findFirst({ where: { id, userId: ctx.userId } });
    if (!existing) throw notFound("Goal not found.");
    await checkSessionRefs(ctx.userId, { subjectId: input.subjectId ?? existing.subjectId, topicId: input.topicId });
    const completing = input.status === "COMPLETED" && existing.status !== "COMPLETED";
    const g = await prisma.learningGoal.update({
      where: { id },
      data: {
        ...input,
        targetDate: input.targetDate === undefined ? undefined : input.targetDate ? dateColumn(input.targetDate) : null,
        ...(input.status ? { completedAt: input.status === "COMPLETED" ? (existing.completedAt ?? new Date()) : null } : {}),
      },
      include: goalInclude,
    });
    await syncGoalDeadline(ctx.userId, g);
    if (completing) {
      await logActivity(ctx, "goal.completed", { type: "goal", id });
      await notifyGoalCompleted(ctx, g);
    }
    return { goal: presentGoal(g) };
  });

  /** Sessions and events stay; they simply lose the goal link (deadline event is removed). */
  r.delete("/goals/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    await assertOwned("learningGoal", userId, id, "Goal");
    await prisma.learningGoal.delete({ where: { id } });
  });

  r.post("/goals/:id/milestones", async ({ userId }, req) => {
    const goalId = param(req, "id");
    const { title } = milestoneInput.parse(req.body);
    await assertOwned("learningGoal", userId, goalId, "Goal");
    const position = await prisma.learningMilestone.count({ where: { goalId } });
    return { milestone: await prisma.learningMilestone.create({ data: { userId, goalId, title, position } }) };
  });

  r.patch("/milestones/:id", async (ctx, req) => {
    const input = milestonePatch.parse(req.body);
    const m = await prisma.learningMilestone.findFirst({ where: { id: param(req, "id"), userId: ctx.userId } });
    if (!m) throw notFound("Milestone not found.");
    const updated = await prisma.learningMilestone.update({
      where: { id: m.id },
      data: { title: input.title, ...(input.done !== undefined ? { completedAt: input.done ? (m.completedAt ?? new Date()) : null } : {}) },
    });
    if (input.done) {
      await touchGoal(m.goalId);
      await logActivity(ctx, "milestone.completed", { type: "milestone", id: m.id });
    }
    return { milestone: updated };
  });

  r.delete("/milestones/:id", async ({ userId }, req) => {
    const res = await prisma.learningMilestone.deleteMany({ where: { id: param(req, "id"), userId } });
    if (res.count === 0) throw notFound("Milestone not found.");
  });

  // ── Sessions ──
  r.get("/sessions", async ({ userId }, req) => {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.split(",") : undefined;
    const sessions = await prisma.learningSession.findMany({
      where: { userId, startsAt: { gte: from, lt: to }, ...(status ? { status: { in: status as never[] } } : {}) },
      orderBy: { startsAt: "asc" },
      take: 500,
      include: sessionInclude,
    });
    return { sessions: sessions.map(presentSession) };
  });

  r.get("/sessions/:id", async ({ userId }, req) => ({ session: presentSession(await loadSession(userId, param(req, "id"))) }));

  r.post("/sessions", async (ctx, req) => {
    const { recurrence, repeatUntil, ...input } = sessionInput.parse(req.body);
    await checkSessionRefs(ctx.userId, input);
    const starts = occurrences(new Date(input.startsAt), ctx.tz, recurrence, repeatUntil);
    const prefs = await prisma.userPreferences.findUnique({ where: { userId: ctx.userId }, select: { notifySessions: true, defaultReminderMins: true } });
    const created: string[] = [];
    let seriesId: string | null = null;
    for (const startsAt of starts) {
      const s: { id: string } = await prisma.learningSession.create({
        data: { ...input, startsAt, userId: ctx.userId, seriesId, rrule: seriesId === null && recurrence !== "NONE" ? `${recurrence};UNTIL=${repeatUntil}` : null },
      });
      if (recurrence !== "NONE" && seriesId === null) {
        seriesId = s.id;
        await prisma.learningSession.update({ where: { id: s.id }, data: { seriesId } });
      }
      if (prefs?.notifySessions !== false) await setReminders(ctx.userId, { sessionId: s.id }, startsAt, [prefs?.defaultReminderMins ?? 30]);
      created.push(s.id);
    }
    await touchGoal(input.goalId);
    return { created: created.length, sessionId: created[0], seriesId };
  });

  r.patch("/sessions/:id", async (ctx, req) => {
    const input = sessionPatch.parse(req.body);
    const s = await loadSession(ctx.userId, param(req, "id"));
    await checkSessionRefs(ctx.userId, { subjectId: input.subjectId ?? s.subjectId, topicId: input.topicId, goalId: input.goalId, milestoneId: input.milestoneId });
    const updated = await prisma.learningSession.update({ where: { id: s.id }, data: { ...input, startsAt: input.startsAt ? new Date(input.startsAt) : undefined }, include: sessionInclude });
    if (input.startsAt && updated.status === "SCHEDULED") {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId: ctx.userId }, select: { defaultReminderMins: true, notifySessions: true } });
      if (prefs?.notifySessions !== false) await setReminders(ctx.userId, { sessionId: s.id }, updated.startsAt, [prefs?.defaultReminderMins ?? 30]);
    }
    return { session: presentSession(updated) };
  });

  r.post("/sessions/:id/start", async (ctx, req) => {
    const s = await loadSession(ctx.userId, param(req, "id"));
    if (s.status === "COMPLETED" || s.status === "CANCELLED") throw conflict("SESSION_CLOSED", "This session is already finished.");
    if (s.runningSince) return { session: presentSession(s) };
    // Only one session runs at a time: pause any other running one.
    const running = await prisma.learningSession.findMany({ where: { userId: ctx.userId, runningSince: { not: null }, id: { not: s.id } } });
    for (const o of running) await prisma.learningSession.update({ where: { id: o.id }, data: { status: "PAUSED", runningSince: null, elapsedSecs: elapsedNow(o) } });
    const updated = await prisma.learningSession.update({ where: { id: s.id }, data: { status: "IN_PROGRESS", runningSince: new Date() }, include: sessionInclude });
    await touchGoal(s.goalId);
    return { session: presentSession(updated) };
  });

  r.post("/sessions/:id/pause", async ({ userId }, req) => {
    const s = await loadSession(userId, param(req, "id"));
    if (!s.runningSince) throw conflict("NOT_RUNNING", "This session isn't running.");
    const updated = await prisma.learningSession.update({ where: { id: s.id }, data: { status: "PAUSED", runningSince: null, elapsedSecs: elapsedNow(s) }, include: sessionInclude });
    return { session: presentSession(updated) };
  });

  r.post("/sessions/:id/complete", async (ctx, req) => {
    const { actualMins } = sessionComplete.parse(req.body ?? {});
    const s = await loadSession(ctx.userId, param(req, "id"));
    if (s.status === "COMPLETED") throw conflict("SESSION_CLOSED", "This session is already completed.");
    if (s.status === "CANCELLED") throw conflict("SESSION_CLOSED", "This session was cancelled.");
    return { session: presentSession(await finishTimer(ctx, s, actualMins)) };
  });

  r.post("/sessions/:id/reschedule", async (ctx, req) => {
    const { startsAt } = sessionReschedule.parse(req.body);
    const s = await loadSession(ctx.userId, param(req, "id"));
    if (s.status === "COMPLETED" || s.status === "CANCELLED") throw conflict("SESSION_CLOSED", "Finished sessions can't be rescheduled.");
    const updated = await prisma.learningSession.update({
      where: { id: s.id },
      data: { startsAt: new Date(startsAt), status: s.elapsedSecs > 0 ? "PAUSED" : "SCHEDULED", runningSince: null, elapsedSecs: elapsedNow(s), rescheduledFromId: s.rescheduledFromId ?? s.id },
      include: sessionInclude,
    });
    const prefs = await prisma.userPreferences.findUnique({ where: { userId: ctx.userId }, select: { defaultReminderMins: true, notifySessions: true } });
    if (prefs?.notifySessions !== false) await setReminders(ctx.userId, { sessionId: s.id }, updated.startsAt, [prefs?.defaultReminderMins ?? 30]);
    return { session: presentSession(updated) };
  });

  r.post("/sessions/:id/cancel", async ({ userId }, req) => {
    const s = await loadSession(userId, param(req, "id"));
    if (s.status === "COMPLETED") throw conflict("SESSION_CLOSED", "Completed sessions can't be cancelled.");
    await prisma.reminder.deleteMany({ where: { sessionId: s.id, sentAt: null } });
    const updated = await prisma.learningSession.update({ where: { id: s.id }, data: { status: "CANCELLED", runningSince: null, elapsedSecs: elapsedNow(s) }, include: sessionInclude });
    return { session: presentSession(updated) };
  });

  /** Delete one session, or with ?series=future this and later sessions in its series. */
  r.delete("/sessions/:id", async ({ userId }, req) => {
    const s = await loadSession(userId, param(req, "id"));
    if (req.query.series === "future" && s.seriesId) {
      await prisma.learningSession.deleteMany({ where: { userId, seriesId: s.seriesId, startsAt: { gte: s.startsAt }, status: { notIn: ["COMPLETED"] } } });
    } else {
      await prisma.learningSession.delete({ where: { id: s.id } });
    }
  });

  // ── Focus timer ──
  r.post("/focus", async (ctx, req) => {
    const input = focusInput.parse(req.body);
    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    const secs = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (secs < 60) throw badRequest("Focus sessions shorter than a minute aren't saved.");
    if (secs > 12 * 3600 || endedAt.getTime() > Date.now() + 60_000) throw badRequest("That focus session isn't valid.");
    await assertOwned("subject", ctx.userId, input.subjectId, "Subject");
    await assertOwned("learningSession", ctx.userId, input.sessionId, "Study session");
    const f = await prisma.focusSession.create({ data: { userId: ctx.userId, startedAt, endedAt, durationSecs: secs, label: input.label, subjectId: input.subjectId, sessionId: input.sessionId } });
    await logActivity(ctx, "focus.completed", { type: "focus", id: f.id }, { minutes: Math.round(secs / 60) });
    return { focus: f };
  });

  r.get("/focus", async (ctx) => {
    const { start } = localDayRange(new Date(), ctx.tz);
    const [today, recent] = await Promise.all([
      prisma.focusSession.aggregate({ where: { userId: ctx.userId, endedAt: { gte: start } }, _sum: { durationSecs: true }, _count: true }),
      prisma.focusSession.findMany({ where: { userId: ctx.userId }, orderBy: { endedAt: "desc" }, take: 20, include: { subject: { select: { name: true } } } }),
    ]);
    return { todaySecs: today._sum.durationSecs ?? 0, todayCount: today._count, recent };
  });

  return r.router;
}
