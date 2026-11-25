import { DIFFICULTIES } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import type { UserCtx } from "../../lib/context.ts";
import { addDaysToKey, localDateKey, startOfLocalDay } from "../../lib/time.ts";

/*
 * Analytics computed from stored records only: AnswerSubmission (accuracy), FocusSession
 * (study time), ActivityLog (streaks), sessions, goals and revision. No metric is shown
 * from too little data: topic judgements need MIN_SAMPLE graded answers.
 */
export const MIN_SAMPLE = 5;
const STREAK_KINDS = ["quiz.completed", "revision.completed", "session.completed", "focus.completed", "snippet.created", "paper.completed", "milestone.completed"];

type Graded = { verdict: string };
export function accuracyOf(rows: Graded[]) {
  const graded = rows.filter((r) => r.verdict !== "UNGRADED");
  if (!graded.length) return null;
  const pts = graded.reduce((s, r) => s + (r.verdict === "CORRECT" ? 1 : r.verdict === "PARTIAL" ? 0.5 : 0), 0);
  return Math.round((pts / graded.length) * 100);
}

export async function streak(ctx: UserCtx) {
  const rows = await prisma.activityLog.findMany({
    where: { userId: ctx.userId, kind: { in: STREAK_KINDS } },
    distinct: ["localDate"],
    orderBy: { localDate: "desc" },
    take: 400,
    select: { localDate: true },
  });
  const days = new Set(rows.map((r) => r.localDate.toISOString().slice(0, 10)));
  const today = localDateKey(new Date(), ctx.tz);
  // Today not studied yet doesn't break the streak until the day is over.
  let key = days.has(today) ? today : addDaysToKey(today, -1);
  let current = 0;
  while (days.has(key)) {
    current++;
    key = addDaysToKey(key, -1);
  }
  return { current, activeToday: days.has(today) };
}

export async function studySeconds(userId: string, from?: Date, to?: Date) {
  const agg = await prisma.focusSession.aggregate({ where: { userId, endedAt: { gte: from, lt: to } }, _sum: { durationSecs: true } });
  return agg._sum.durationSecs ?? 0;
}

export async function overview(ctx: UserCtx) {
  const { userId } = ctx;
  const [subs, snippets, quizzes, papers, goalsDone, goalsTotal, revisionSessions, revisionDone, secs, s, questionsSaved] = await Promise.all([
    prisma.answerSubmission.findMany({ where: { userId }, select: { verdict: true } }),
    prisma.codeSnippet.count({ where: { userId } }),
    prisma.quizAttempt.count({ where: { userId, status: "GRADED" } }),
    prisma.paperAttempt.count({ where: { userId, status: { in: ["GRADED", "SUBMITTED"] } } }),
    prisma.learningGoal.count({ where: { userId, status: "COMPLETED" } }),
    prisma.learningGoal.count({ where: { userId } }),
    prisma.revisionSession.count({ where: { userId } }),
    prisma.revisionSession.count({ where: { userId, completedAt: { not: null } } }),
    studySeconds(userId),
    streak(ctx),
    prisma.question.count({ where: { userId, inLibrary: true } }),
  ]);
  return {
    attempted: subs.length,
    correct: subs.filter((x) => x.verdict === "CORRECT").length,
    partial: subs.filter((x) => x.verdict === "PARTIAL").length,
    incorrect: subs.filter((x) => x.verdict === "INCORRECT").length,
    accuracy: accuracyOf(subs),
    studyHours: Math.round((secs / 3600) * 10) / 10,
    snippets,
    questionsSaved,
    quizzesCompleted: quizzes,
    papersAttempted: papers,
    goalsCompleted: goalsDone,
    goalsTotal,
    revisionCompletion: revisionSessions ? Math.round((revisionDone / revisionSessions) * 100) : null,
    streak: s.current,
  };
}

export async function subjectStats(ctx: UserCtx) {
  const { userId } = ctx;
  const [subjects, subs, focus] = await Promise.all([
    prisma.subject.findMany({ where: { userId, archivedAt: null }, orderBy: { position: "asc" }, include: { topics: { select: { id: true, name: true } } } }),
    prisma.answerSubmission.findMany({ where: { userId }, select: { verdict: true, submittedAt: true, question: { select: { subjectId: true, topicId: true, difficulty: true } } } }),
    prisma.focusSession.groupBy({ by: ["subjectId"], where: { userId }, _sum: { durationSecs: true } }),
  ]);
  const sessionsDone = await prisma.learningSession.findMany({ where: { userId, status: "COMPLETED", topicId: { not: null } }, select: { topicId: true } });
  return subjects.map((sub) => {
    const mine = subs.filter((x) => x.question.subjectId === sub.id);
    const topicStats = sub.topics.map((t) => {
      const ts = mine.filter((x) => x.question.topicId === t.id);
      return { id: t.id, name: t.name, attempts: ts.length, accuracy: accuracyOf(ts) };
    });
    const studied = new Set([...mine.map((x) => x.question.topicId), ...sessionsDone.map((x) => x.topicId)].filter(Boolean));
    const avgDifficulty = mine.length ? mine.reduce((s, x) => s + DIFFICULTIES.indexOf(x.question.difficulty), 0) / mine.length : null;
    const last = mine.reduce<Date | null>((d, x) => (!d || x.submittedAt > d ? x.submittedAt : d), null);
    return {
      id: sub.id,
      name: sub.name,
      topics: sub.topics.length,
      topicsStudied: sub.topics.filter((t) => studied.has(t.id)).length,
      // "Completed" = enough practice and >= 80% accuracy.
      topicsCompleted: topicStats.filter((t) => t.attempts >= MIN_SAMPLE && (t.accuracy ?? 0) >= 80).length,
      attempted: mine.length,
      accuracy: accuracyOf(mine),
      avgDifficulty: avgDifficulty === null ? null : DIFFICULTIES[Math.round(avgDifficulty)]!,
      studyMinutes: Math.round((focus.find((f) => f.subjectId === sub.id)?._sum.durationSecs ?? 0) / 60),
      weakTopics: topicStats.filter((t) => t.attempts >= MIN_SAMPLE && (t.accuracy ?? 100) < 60).map((t) => t.name),
      lastPractisedAt: last,
    };
  });
}

export async function topicStats(ctx: UserCtx, subjectId?: string) {
  const subs = await prisma.answerSubmission.findMany({
    where: { userId: ctx.userId, question: subjectId ? { subjectId } : undefined },
    select: { verdict: true, submittedAt: true, question: { select: { topic: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } } } },
  });
  const map = new Map<string, { topicId: string | null; topic: string; subject: string; rows: { verdict: string; submittedAt: Date }[] }>();
  for (const s of subs) {
    const key = `${s.question.subject.id}:${s.question.topic?.id ?? "none"}`;
    const e = map.get(key) ?? { topicId: s.question.topic?.id ?? null, topic: s.question.topic?.name ?? "No topic", subject: s.question.subject.name, rows: [] };
    e.rows.push(s);
    map.set(key, e);
  }
  const cutoff = Date.now() - 14 * 86_400_000;
  return [...map.values()]
    .map((e) => {
      const recent = e.rows.filter((r) => r.submittedAt.getTime() >= cutoff);
      const older = e.rows.filter((r) => r.submittedAt.getTime() < cutoff);
      return {
        topicId: e.topicId,
        topic: e.topic,
        subject: e.subject,
        attempts: e.rows.length,
        accuracy: accuracyOf(e.rows),
        enoughData: e.rows.length >= MIN_SAMPLE,
        recentAccuracy: recent.length >= 4 ? accuracyOf(recent) : null,
        previousAccuracy: older.length >= 4 ? accuracyOf(older) : null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

/** Daily series over the last N local days: study minutes, attempts, accuracy, revisions. */
export async function timeseries(ctx: UserCtx, days: number) {
  const todayKey = localDateKey(new Date(), ctx.tz);
  const firstKey = addDaysToKey(todayKey, -(days - 1));
  const from = startOfLocalDay(firstKey, ctx.tz);
  const [subs, focus, reviews, planned] = await Promise.all([
    prisma.answerSubmission.findMany({ where: { userId: ctx.userId, submittedAt: { gte: from } }, select: { verdict: true, submittedAt: true } }),
    prisma.focusSession.findMany({ where: { userId: ctx.userId, endedAt: { gte: from } }, select: { durationSecs: true, endedAt: true } }),
    prisma.revisionReview.findMany({ where: { revisionItem: { userId: ctx.userId }, reviewedAt: { gte: from } }, select: { verdict: true, reviewedAt: true } }),
    prisma.learningSession.findMany({ where: { userId: ctx.userId, startsAt: { gte: from }, status: { not: "CANCELLED" } }, select: { startsAt: true, plannedMins: true, status: true } }),
  ]);
  const out = Array.from({ length: days }, (_, i) => {
    const key = addDaysToKey(firstKey, i);
    return { date: key, studyMins: 0, plannedMins: 0, completedSessions: 0, attempts: 0, accuracy: null as number | null, revisions: 0, _rows: [] as { verdict: string }[] };
  });
  const idx = new Map(out.map((d, i) => [d.date, i]));
  const at = (d: Date) => out[idx.get(localDateKey(d, ctx.tz)) ?? -1];
  for (const s of subs) {
    const d = at(s.submittedAt);
    if (d) {
      d.attempts++;
      d._rows.push(s);
    }
  }
  for (const f of focus) {
    const d = at(f.endedAt);
    if (d) d.studyMins += Math.round(f.durationSecs / 60);
  }
  for (const r of reviews) {
    const d = at(r.reviewedAt);
    if (d) d.revisions++;
  }
  for (const p of planned) {
    const d = at(p.startsAt);
    if (d) {
      d.plannedMins += p.plannedMins;
      if (p.status === "COMPLETED") d.completedSessions++;
    }
  }
  return out.map(({ _rows, ...d }) => ({ ...d, accuracy: accuracyOf(_rows) }));
}

export async function difficultyStats(ctx: UserCtx) {
  const subs = await prisma.answerSubmission.findMany({ where: { userId: ctx.userId }, select: { verdict: true, question: { select: { difficulty: true } } } });
  return DIFFICULTIES.map((d) => {
    const rows = subs.filter((s) => s.question.difficulty === d);
    return { difficulty: d, attempts: rows.length, accuracy: accuracyOf(rows) };
  });
}

export async function revisionStats(ctx: UserCtx) {
  const [byStatus, reviews] = await Promise.all([
    prisma.revisionItem.groupBy({ by: ["status"], where: { userId: ctx.userId }, _count: true }),
    prisma.revisionReview.findMany({ where: { revisionItem: { userId: ctx.userId } }, select: { verdict: true, reviewedAt: true }, orderBy: { reviewedAt: "asc" } }),
  ]);
  // Share of revision answers that were correct, week by week.
  const weeks = new Map<string, { verdict: string }[]>();
  for (const r of reviews) {
    const key = addDaysToKey(localDateKey(r.reviewedAt, ctx.tz), -((r.reviewedAt.getUTCDay() + 6) % 7));
    weeks.set(key, [...(weeks.get(key) ?? []), r]);
  }
  return {
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    totalReviews: reviews.length,
    weekly: [...weeks.entries()].slice(-12).map(([week, rows]) => ({ week, reviews: rows.length, accuracy: accuracyOf(rows) })),
  };
}

/** Recommendations derived from real records. Each one states the data it is based on. */
export async function insights(ctx: UserCtx) {
  const out: { kind: "weak" | "improving" | "revision" | "neglected" | "streak" | "start"; text: string; link?: string }[] = [];
  const [topics, due, subjects, s, attempts] = await Promise.all([
    topicStats(ctx),
    prisma.revisionItem.count({ where: { userId: ctx.userId, status: { not: "SUSPENDED" }, nextReviewAt: { lte: new Date() } } }),
    subjectStats(ctx),
    streak(ctx),
    prisma.answerSubmission.count({ where: { userId: ctx.userId } }),
  ]);
  if (attempts === 0) {
    out.push({ kind: "start", text: "Answer a few practice questions and your insights will appear here.", link: "/app/practice" });
    return out;
  }
  for (const t of topics.filter((t) => t.enoughData && (t.accuracy ?? 100) < 60).slice(0, 3)) {
    out.push({ kind: "weak", text: `${t.topic} (${t.subject}) needs more practice: ${t.accuracy}% accuracy over ${t.attempts} answers.`, link: "/app/practice" });
  }
  for (const t of topics.filter((t) => t.recentAccuracy !== null && t.previousAccuracy !== null && t.recentAccuracy - t.previousAccuracy >= 15).slice(0, 2)) {
    out.push({ kind: "improving", text: `Your accuracy in ${t.topic} improved from ${t.previousAccuracy}% to ${t.recentAccuracy}% in the last two weeks.` });
  }
  if (due > 0) out.push({ kind: "revision", text: `You have ${due} question${due === 1 ? "" : "s"} due for revision.`, link: "/app/revision" });
  const twoWeeksAgo = Date.now() - 14 * 86_400_000;
  for (const sub of subjects.filter((x) => x.attempted > 0 && x.lastPractisedAt && x.lastPractisedAt.getTime() < twoWeeksAgo).slice(0, 2)) {
    const daysAgo = Math.floor((Date.now() - sub.lastPractisedAt!.getTime()) / 86_400_000);
    out.push({ kind: "neglected", text: `You haven't practised ${sub.name} for ${daysAgo} days.`, link: "/app/practice" });
  }
  if (s.current >= 3) out.push({ kind: "streak", text: `You're on a ${s.current}-day learning streak.` });
  return out;
}
