import type { ColorMark, Verdict } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import type { UserCtx } from "../../lib/context.ts";
import { localDayRange, localWeekday } from "../../lib/time.ts";
import { INITIAL_STATE, nextSchedule } from "./scheduler.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Called after every graded answer (quiz, paper or revision). Wrong or partial answers
 * create or update the question's revision item. A correct answer only advances an item
 * that already exists; nothing is ever deleted, so history accumulates.
 */
export async function recordOutcome(
  userId: string,
  questionId: string,
  verdict: Verdict,
  opts: { submissionId?: string; revisionSessionId?: string | null } = {},
) {
  if (verdict === "UNGRADED") return;
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { difficulty: true, colorMark: true, revisionItem: true },
  });
  if (!q) return;
  const item = q.revisionItem;
  if (!item && verdict === "CORRECT") return; // nothing to revise

  const prev = item ?? { ...INITIAL_STATE };
  const next = nextSchedule(prev, verdict, q.difficulty, q.colorMark);
  const nextReviewAt = new Date(Date.now() + next.intervalDays * DAY);
  const reason = verdict === "INCORRECT" ? "incorrect" : verdict === "PARTIAL" ? "partial" : (item?.reason ?? "incorrect");

  const saved = await prisma.revisionItem.upsert({
    where: { questionId },
    create: {
      userId,
      questionId,
      ease: next.ease,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      totalReviews: 1,
      status: next.status,
      lastReviewedAt: new Date(),
      nextReviewAt,
      reason,
    },
    update: {
      ease: next.ease,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      totalReviews: { increment: 1 },
      status: next.status,
      lastReviewedAt: new Date(),
      nextReviewAt,
      dueOverridden: false,
      ...(verdict !== "CORRECT" ? { reason } : {}),
    },
  });

  await prisma.revisionReview.create({
    data: {
      revisionItemId: saved.id,
      revisionSessionId: opts.revisionSessionId ?? null,
      submissionId: opts.submissionId ?? null,
      verdict,
      quality: next.quality,
      prevIntervalDays: prev.intervalDays,
      newIntervalDays: next.intervalDays,
    },
  });
}

/** RED → due today and prioritised; YELLOW → due within two days; GREEN keeps its schedule. */
export async function onMarked(userId: string, questionId: string, mark: ColorMark | null) {
  if (mark !== "RED" && mark !== "YELLOW") return;
  const due = new Date(Date.now() + (mark === "RED" ? 0 : 2 * DAY));
  const existing = await prisma.revisionItem.findUnique({ where: { questionId } });
  if (!existing) {
    await prisma.revisionItem.create({
      data: { userId, questionId, nextReviewAt: due, reason: mark === "RED" ? "red_mark" : "yellow_mark" },
    });
  } else if (!existing.dueOverridden && existing.nextReviewAt > due) {
    // Bring it forward; never push an already-due item further away.
    await prisma.revisionItem.update({ where: { id: existing.id }, data: { nextReviewAt: due } });
  }
}

/** Due questions for a revision session, most urgent first: RED, then most overdue, then most lapses. */
export async function dueQuestionIds(ctx: UserCtx, limit: number, opts: { weekly?: boolean; subjectId?: string } = {}) {
  const { end } = localDayRange(new Date(), ctx.tz);
  const items = await prisma.revisionItem.findMany({
    where: {
      userId: ctx.userId,
      status: { not: "SUSPENDED" },
      question: opts.subjectId ? { subjectId: opts.subjectId } : undefined,
      OR: [
        { nextReviewAt: { lt: end } },
        // The weekly session also sweeps in everything the learner marked red or yellow.
        ...(opts.weekly ? [{ question: { colorMark: { in: ["RED", "YELLOW"] as ColorMark[] } } }] : []),
      ],
    },
    select: { questionId: true, nextReviewAt: true, lapses: true, question: { select: { colorMark: true } } },
  });
  const rank = (m: ColorMark | null) => (m === "RED" ? 0 : m === "YELLOW" ? 1 : 2);
  items.sort(
    (a, b) =>
      rank(a.question.colorMark) - rank(b.question.colorMark) ||
      a.nextReviewAt.getTime() - b.nextReviewAt.getTime() ||
      b.lapses - a.lapses,
  );
  return items.slice(0, limit).map((i) => i.questionId);
}

export async function revisionSummary(ctx: UserCtx) {
  const now = new Date();
  const { start, end } = localDayRange(now, ctx.tz);
  const prefs = await prisma.userPreferences.findUnique({ where: { userId: ctx.userId }, select: { revisionDay: true, revisionSessionSize: true } });
  const revisionDay = prefs?.revisionDay ?? 0;
  const base = { userId: ctx.userId, status: { not: "SUSPENDED" as const } };
  const [overdue, dueToday, upcoming, mastered, red, yellow, total, frequentlyWrong, recentlyMastered] = await Promise.all([
    prisma.revisionItem.count({ where: { ...base, nextReviewAt: { lt: start } } }),
    prisma.revisionItem.count({ where: { ...base, nextReviewAt: { gte: start, lt: end } } }),
    prisma.revisionItem.count({ where: { ...base, nextReviewAt: { gte: end, lt: new Date(end.getTime() + 7 * DAY) } } }),
    prisma.revisionItem.count({ where: { userId: ctx.userId, status: "MASTERED" } }),
    prisma.question.count({ where: { userId: ctx.userId, colorMark: "RED" } }),
    prisma.question.count({ where: { userId: ctx.userId, colorMark: "YELLOW" } }),
    prisma.revisionItem.count({ where: { userId: ctx.userId } }),
    prisma.revisionItem.findMany({
      where: { userId: ctx.userId, lapses: { gte: 2 } },
      orderBy: [{ lapses: "desc" }, { nextReviewAt: "asc" }],
      take: 5,
      select: { lapses: true, nextReviewAt: true, question: { select: { id: true, title: true, subject: { select: { name: true } } } } },
    }),
    prisma.revisionItem.findMany({
      where: { userId: ctx.userId, status: "MASTERED" },
      orderBy: { lastReviewedAt: "desc" },
      take: 5,
      select: { lastReviewedAt: true, question: { select: { id: true, title: true } } },
    }),
  ]);
  const todayIsRevisionDay = localWeekday(now, ctx.tz) === revisionDay;
  const weeklyDone = todayIsRevisionDay
    ? await prisma.revisionSession.findFirst({ where: { userId: ctx.userId, kind: "weekly", scheduledFor: start, completedAt: { not: null } } })
    : null;
  return {
    overdue,
    dueToday,
    dueNow: overdue + dueToday,
    upcoming,
    mastered,
    red,
    yellow,
    total,
    revisionDay,
    sessionSize: prefs?.revisionSessionSize ?? 20,
    todayIsRevisionDay,
    weeklyCompletedToday: !!weeklyDone,
    frequentlyWrong,
    recentlyMastered,
  };
}
