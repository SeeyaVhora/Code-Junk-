import { prisma } from "../../lib/prisma.ts";
import { authedRouter } from "../../lib/route.ts";
import { localDayRange, localWeekRange } from "../../lib/time.ts";
import { revisionSummary } from "../revision/service.ts";
import { refreshUserNotifications } from "../notifications/service.ts";
import { presentEvent } from "../calendar/routes.ts";
import { elapsedNow } from "../planner/service.ts";
import { difficultyStats, insights, overview, revisionStats, streak, studySeconds, subjectStats, timeseries, topicStats } from "./service.ts";

export function analyticsRouter() {
  const r = authedRouter();
  r.get("/overview", async (ctx) => overview(ctx));
  r.get("/subjects", async (ctx) => ({ subjects: await subjectStats(ctx) }));
  r.get("/topics", async (ctx, req) => ({ topics: await topicStats(ctx, typeof req.query.subjectId === "string" ? req.query.subjectId : undefined) }));
  r.get("/timeseries", async (ctx, req) => {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    return { days: await timeseries(ctx, days) };
  });
  r.get("/difficulty", async (ctx) => ({ difficulty: await difficultyStats(ctx) }));
  r.get("/revision", async (ctx) => revisionStats(ctx));
  r.get("/insights", async (ctx) => ({ insights: await insights(ctx) }));
  r.get("/coding", async ({ userId }) => {
    const subs = await prisma.answerSubmission.findMany({
      where: { userId, question: { type: { in: ["SHORT_CODE", "LONG_CODE", "DEBUGGING", "PROBLEM_SOLVING", "PSEUDOCODE", "OUTPUT_PREDICTION"] } } },
      select: { verdict: true, question: { select: { type: true, language: true } } },
    });
    const by = <K extends string>(f: (s: (typeof subs)[number]) => K) => {
      const m = new Map<K, typeof subs>();
      for (const s of subs) m.set(f(s), [...(m.get(f(s)) ?? []), s]);
      return [...m.entries()].map(([key, rows]) => ({
        key,
        attempts: rows.length,
        correct: rows.filter((x) => x.verdict === "CORRECT").length,
      }));
    };
    return { total: subs.length, byType: by((s) => s.question.type), byLanguage: by((s) => s.question.language ?? "none") };
  });
  return r.router;
}

/** Everything the signed-in Home needs, in one request. */
export function dashboardRouter() {
  const r = authedRouter();
  r.get("/", async (ctx) => {
    const { userId, tz } = ctx;
    const now = new Date();
    const day = localDayRange(now, tz);
    const week = localWeekRange(now, tz, ctx.weekStartsOn);
    await refreshUserNotifications(userId).catch(() => {});

    const [today, deadlines, recentActivity, inProgressQuizzes, inProgressPapers, revision, stats, weekDays, weekSecs, s, unread, goals] = await Promise.all([
      prisma.learningSession.findMany({
        where: { userId, startsAt: { gte: day.start, lt: day.end }, status: { not: "CANCELLED" } },
        orderBy: { startsAt: "asc" },
        include: { subject: { select: { id: true, name: true } }, topic: { select: { id: true, name: true } }, goal: { select: { id: true, title: true } } },
      }),
      prisma.calendarEvent.findMany({
        where: {
          userId,
          completedAt: null,
          startsAt: { gte: day.start, lt: new Date(now.getTime() + 30 * 86_400_000) },
          OR: [{ category: { not: "ASSIGNMENT" } }, { assignment: { submissionStatus: { notIn: ["SUBMITTED", "GRADED", "COMPLETED"] } } }],
        },
        orderBy: { startsAt: "asc" },
        take: 8,
        include: { subject: { select: { id: true, name: true } }, goal: { select: { id: true, title: true } }, examination: true, assignment: true, reminders: { where: { sentAt: null }, select: { offsetMins: true } } },
      }),
      prisma.activityLog.findMany({ where: { userId, kind: { in: ["snippet.opened", "snippet.created", "quiz.started", "quiz.completed", "paper.started"] } }, orderBy: { createdAt: "desc" }, take: 40 }),
      prisma.quizAttempt.findMany({
        where: { userId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
        take: 4,
        include: { quiz: { select: { id: true, title: true, _count: { select: { questions: true } } } }, _count: { select: { submissions: true } } },
      }),
      prisma.paperAttempt.findMany({ where: { userId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" }, take: 3, include: { paper: { select: { id: true, title: true } } } }),
      revisionSummary(ctx),
      overview(ctx),
      timeseries(ctx, 7),
      studySeconds(userId, week.start, week.end),
      streak(ctx),
      prisma.notification.count({ where: { userId, readAt: null, kind: { not: "deleted" } } }),
      prisma.learningGoal.findMany({ where: { userId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, orderBy: { targetDate: "asc" }, take: 3, select: { id: true, title: true, targetDate: true } }),
    ]);

    // Overdue assignments are shown too, ahead of upcoming items.
    const overdueAssignments = await prisma.calendarEvent.findMany({
      where: { userId, category: "ASSIGNMENT", startsAt: { lt: day.start }, assignment: { submissionStatus: { notIn: ["SUBMITTED", "GRADED", "COMPLETED"] } } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { subject: { select: { id: true, name: true } }, goal: { select: { id: true, title: true } }, examination: true, assignment: true, reminders: { where: { sentAt: null }, select: { offsetMins: true } } },
    });

    // Recently opened/created snippets and quizzes, de-duplicated, newest first.
    const seen = new Set<string>();
    const recent = recentActivity.filter((a) => a.entityId && !seen.has(a.entityId) && seen.add(a.entityId)).slice(0, 8);
    const snippetIds = recent.filter((a) => a.entityType === "snippet").map((a) => a.entityId!);
    const quizIds = recent.filter((a) => a.entityType === "quiz").map((a) => a.entityId!);
    const paperIds = recent.filter((a) => a.entityType === "paper").map((a) => a.entityId!);
    const [snippets, quizzes, papers] = await Promise.all([
      prisma.codeSnippet.findMany({ where: { id: { in: snippetIds }, userId }, select: { id: true, title: true, language: true, subject: { select: { name: true } }, topic: { select: { name: true } } } }),
      prisma.quiz.findMany({ where: { id: { in: quizIds }, userId }, select: { id: true, title: true, mode: true } }),
      prisma.practicePaper.findMany({ where: { id: { in: paperIds }, userId }, select: { id: true, title: true } }),
    ]);
    const continueItems = recent
      .map((a) => {
        if (a.entityType === "snippet") {
          const sn = snippets.find((x) => x.id === a.entityId);
          return sn && { type: "snippet" as const, id: sn.id, title: sn.title, meta: [sn.subject.name, sn.topic?.name].filter(Boolean).join(" · "), at: a.createdAt };
        }
        if (a.entityType === "quiz") {
          const q = quizzes.find((x) => x.id === a.entityId);
          return q && { type: "quiz" as const, id: q.id, title: q.title, meta: q.mode === "LONG" ? "Long practice" : q.mode === "REVISION" ? "Revision" : "Short practice", at: a.createdAt };
        }
        const p = papers.find((x) => x.id === a.entityId);
        return p && { type: "paper" as const, id: p.id, title: p.title, meta: "Practice paper", at: a.createdAt };
      })
      .filter(Boolean);

    const recentTopics = await prisma.topic.findMany({
      where: { userId, OR: [{ snippets: { some: { lastOpenedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } } }, { questions: { some: { submissions: { some: { submittedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } } } } }] },
      take: 6,
      select: { id: true, name: true, subject: { select: { id: true, name: true } } },
    });

    return {
      now: now.toISOString(),
      timeZone: tz,
      today: today.map((x) => ({ ...x, elapsedSecs: elapsedNow(x) })),
      deadlines: [...overdueAssignments, ...deadlines].map(presentEvent),
      continue: { items: continueItems, quizzes: inProgressQuizzes, papers: inProgressPapers, topics: recentTopics },
      revision,
      stats: { ...stats, streak: s.current, activeToday: s.activeToday, weekStudyMins: Math.round(weekSecs / 60) },
      week: weekDays,
      goals,
      unreadNotifications: unread,
    };
  });
  return r.router;
}
