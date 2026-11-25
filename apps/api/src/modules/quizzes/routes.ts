import type { RequestHandler } from "express";
import {
  answerInput,
  DIFFICULTY_LABEL,
  generateQuizInput,
  practiceFromLibraryInput,
  selfGradeInput,
  type Verdict,
} from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors.ts";
import { logActivity, type UserCtx } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { localDateKey, localDayRange, localWeekday } from "../../lib/time.ts";
import { aiQuestionList, generateQuestionsPrompt } from "../../ai/prompts.ts";
import { generateStructured, requireProvider } from "../../ai/service.ts";
import { dueQuestionIds } from "../revision/service.ts";
import { gradeAnswer, hideAnswer, recordSubmission, saveGeneratedQuestions, selfGrade, topicIdsByName, validateGenerated } from "../questions/service.ts";

const questionSelect = {
  id: true,
  title: true,
  body: true,
  type: true,
  difficulty: true,
  language: true,
  options: true,
  starterCode: true,
  correctOptionIds: true,
  expectedAnswer: true,
  solution: true,
  explanation: true,
  evaluationCriteria: true,
  concepts: true,
  colorMark: true,
  isBookmarked: true,
  isFavorite: true,
  inLibrary: true,
  personalNotes: true,
  topic: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.QuestionSelect;

async function loadAttempt(userId: string, attemptId: string) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      quiz: {
        include: {
          subject: { select: { id: true, name: true } },
          questions: { orderBy: { position: "asc" }, include: { question: { select: questionSelect } } },
        },
      },
      submissions: { orderBy: { submittedAt: "asc" } },
    },
  });
  if (!attempt) throw notFound("Attempt not found.");
  return attempt;
}

/** Attempt view for the player: answers are revealed only for questions already submitted. */
function presentAttempt(a: Awaited<ReturnType<typeof loadAttempt>>) {
  const done = a.status !== "IN_PROGRESS";
  const byQ = new Map(a.submissions.map((s) => [s.questionId, s]));
  return {
    id: a.id,
    status: a.status,
    currentIndex: a.currentIndex,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    durationSecs: a.durationSecs,
    quiz: { id: a.quiz.id, title: a.quiz.title, mode: a.quiz.mode, subject: a.quiz.subject, isSaved: a.quiz.isSaved },
    questions: a.quiz.questions.map(({ question }) => {
      const submission = byQ.get(question.id) ?? null;
      return { ...(submission || done ? question : hideAnswer(question)), submission };
    }),
  };
}

function summarise(a: Awaited<ReturnType<typeof loadAttempt>>) {
  const counts: Record<Verdict, number> = { CORRECT: 0, PARTIAL: 0, INCORRECT: 0, UNGRADED: 0 };
  const byTopic = new Map<string, { topic: string; correct: number; partial: number; incorrect: number; total: number }>();
  const byQ = new Map(a.submissions.map((s) => [s.questionId, s]));
  for (const { question } of a.quiz.questions) {
    const v = byQ.get(question.id)?.verdict ?? "UNGRADED";
    counts[v]++;
    const key = question.topic?.name ?? "General";
    const t = byTopic.get(key) ?? { topic: key, correct: 0, partial: 0, incorrect: 0, total: 0 };
    t.total++;
    if (v === "CORRECT") t.correct++;
    else if (v === "PARTIAL") t.partial++;
    else if (v === "INCORRECT") t.incorrect++;
    byTopic.set(key, t);
  }
  const graded = counts.CORRECT + counts.PARTIAL + counts.INCORRECT;
  return {
    total: a.quiz.questions.length,
    answered: a.submissions.length,
    correct: counts.CORRECT,
    partial: counts.PARTIAL,
    incorrect: counts.INCORRECT,
    ungraded: counts.UNGRADED,
    accuracy: graded ? Math.round(((counts.CORRECT + counts.PARTIAL * 0.5) / graded) * 100) : null,
    byTopic: [...byTopic.values()],
    toRevise: a.quiz.questions
      .filter(({ question }) => {
        const v = byQ.get(question.id)?.verdict;
        return v === "INCORRECT" || v === "PARTIAL" || question.colorMark === "RED" || question.colorMark === "YELLOW";
      })
      .map(({ question }) => ({ id: question.id, title: question.title })),
  };
}

async function createQuiz(
  ctx: UserCtx,
  data: { subjectId: string; title: string; mode: "SHORT" | "LONG" | "REVISION"; questionIds: string[]; language?: string | null; difficulty?: Prisma.QuizCreateInput["difficulty"]; types?: Prisma.QuizCreateInput["questionTypes"]; topicIds?: string[]; aiProvider?: "OPENAI" | "GEMINI"; aiRequestId?: string; isSaved?: boolean; revisionSessionId?: string },
) {
  return prisma.quiz.create({
    data: {
      userId: ctx.userId,
      subjectId: data.subjectId,
      title: data.title,
      mode: data.mode,
      language: data.language ?? null,
      difficulty: data.difficulty ?? null,
      questionTypes: data.types ?? [],
      requestedCount: data.questionIds.length,
      aiProvider: data.aiProvider,
      aiRequestId: data.aiRequestId,
      isSaved: data.isSaved ?? false,
      revisionSessionId: data.revisionSessionId,
      questions: { create: data.questionIds.map((questionId, position) => ({ questionId, position })) },
      topics: data.topicIds?.length ? { create: [...new Set(data.topicIds)].map((topicId) => ({ topicId })) } : undefined,
    },
  });
}

export function quizzesRouter(limits: { generate: RequestHandler; evaluate: RequestHandler }) {
  const r = authedRouter();

  r.get("/", async ({ userId }, req) => {
    const saved = req.query.saved === "true" ? true : undefined;
    const quizzes = await prisma.quiz.findMany({
      where: { userId, isSaved: saved },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        subject: { select: { id: true, name: true } },
        _count: { select: { questions: true } },
        attempts: { orderBy: { startedAt: "desc" }, select: { id: true, status: true, startedAt: true, correctCount: true, partialCount: true, incorrectCount: true, currentIndex: true } },
      },
    });
    return { quizzes };
  });

  /** Generate a quiz with AI. The questions are saved (outside the library) with the quiz. */
  r.router.post("/generate", limits.generate);
  r.post("/generate", async (ctx, req) => {
    const input = generateQuizInput.parse(req.body);
    const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, userId: ctx.userId } });
    if (!subject) throw notFound("Subject not found.");
    const topics = input.topicIds.length
      ? await prisma.topic.findMany({ where: { id: { in: input.topicIds }, userId: ctx.userId, subjectId: subject.id } })
      : [];
    if (topics.length !== input.topicIds.length) throw notFound("Some topics were not found in this subject.");
    // Custom topics become real topics of the subject, so they can be chosen again later.
    if (input.customTopics.length) await topicIdsByName(ctx.userId, subject.id, input.customTopics);
    const topicNames = [...topics.map((t) => t.name), ...input.customTopics];

    const resolved = await requireProvider(ctx.userId, input.provider);
    const recent = await prisma.question.findMany({
      where: { userId: ctx.userId, subjectId: subject.id, source: "AI_GENERATED" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { title: true },
    });
    const language = subject.isCoding ? (input.language ?? subject.defaultLang ?? null) : null;
    const prompt = generateQuestionsPrompt({
      subject: subject.name,
      topics: topicNames,
      language,
      difficulty: input.difficulty,
      count: input.count,
      types: input.types,
      mode: input.mode,
      instructions: input.instructions,
      avoidTitles: recent.map((q) => q.title),
    });
    const { data, requestId } = await generateStructured({
      userId: ctx.userId,
      resolved,
      purpose: "generate_quiz",
      promptVersion: prompt.version,
      system: prompt.system,
      user: prompt.user,
      schema: aiQuestionList,
      maxOutputTokens: Math.min(16_000, 900 * input.count + (input.mode === "LONG" ? 600 * input.count : 0)),
    });
    const valid = validateGenerated(data.questions.filter((q) => input.types.includes(q.type))).slice(0, input.count);
    if (valid.length < Math.ceil(input.count / 2)) {
      throw new AppError(422, "AI_INVALID_OUTPUT", "The AI's questions didn't pass our checks (e.g. answer keys that don't match the options). Please try again.");
    }
    const created = await saveGeneratedQuestions(ctx.userId, subject.id, valid, {
      language,
      source: "AI_GENERATED",
      inLibrary: false,
      aiRequestId: requestId,
      fallbackTopicId: topics.length === 1 ? topics[0]!.id : null,
    });
    const quiz = await createQuiz(ctx, {
      subjectId: subject.id,
      title: `${subject.name}: ${topicNames.slice(0, 3).join(", ") || "Practice"}${topicNames.length > 3 ? "…" : ""} (${input.difficulty === "MIXED" ? "Mixed" : DIFFICULTY_LABEL[input.difficulty]})`.slice(0, 160),
      mode: input.mode,
      questionIds: created.map((q) => q.id),
      language,
      difficulty: input.difficulty === "MIXED" ? null : input.difficulty,
      types: input.types,
      topicIds: [...topics.map((t) => t.id), ...created.map((q) => q.topicId).filter((t): t is string => !!t)],
      aiProvider: resolved.provider.name,
      aiRequestId: requestId,
    });
    await logActivity(ctx, "quiz.generated", { type: "quiz", id: quiz.id });
    return { quizId: quiz.id, generated: created.length, requested: input.count };
  });

  /** Practice existing questions: incorrect ones, due revision, or a hand-picked set. */
  r.post("/practice", async (ctx, req) => {
    const input = practiceFromLibraryInput.parse(req.body);
    let ids: string[] = [];
    let revisionSessionId: string | undefined;
    if (input.source === "questions") {
      if (!input.questionIds?.length) throw badRequest("Choose some questions.");
      const owned = await prisma.question.findMany({ where: { id: { in: input.questionIds }, userId: ctx.userId }, select: { id: true } });
      ids = input.questionIds.filter((id) => owned.some((o) => o.id === id));
    } else if (input.source === "incorrect") {
      const rows = await prisma.question.findMany({
        where: { userId: ctx.userId, subjectId: input.subjectId, submissions: { some: { verdict: { in: ["INCORRECT", "PARTIAL"] } } } },
        include: { submissions: { orderBy: { submittedAt: "desc" }, take: 1, select: { verdict: true } } },
      });
      // Unresolved first (latest answer still wrong).
      rows.sort((a, b) => Number(a.submissions[0]?.verdict === "CORRECT") - Number(b.submissions[0]?.verdict === "CORRECT"));
      ids = rows.slice(0, input.limit).map((q) => q.id);
    } else {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId: ctx.userId }, select: { revisionDay: true, revisionSessionSize: true } });
      const weekly = localWeekday(new Date(), ctx.tz) === (prefs?.revisionDay ?? 0);
      ids = await dueQuestionIds(ctx, Math.min(input.limit, prefs?.revisionSessionSize ?? 20), { weekly, subjectId: input.subjectId });
      if (ids.length) {
        const { start } = localDayRange(new Date(), ctx.tz);
        const kind = weekly ? "weekly" : "spaced";
        // One weekly session per revision day; spaced sessions are timestamped so several can happen.
        const session = weekly
          ? await prisma.revisionSession.upsert({
              where: { userId_kind_scheduledFor: { userId: ctx.userId, kind, scheduledFor: start } },
              create: { userId: ctx.userId, kind, scheduledFor: start },
              update: {},
            })
          : await prisma.revisionSession.create({ data: { userId: ctx.userId, kind, scheduledFor: new Date() } });
        const existingQuiz = await prisma.quiz.findUnique({ where: { revisionSessionId: session.id } });
        if (existingQuiz && !session.completedAt) return { quizId: existingQuiz.id, count: ids.length };
        revisionSessionId = existingQuiz ? (await prisma.revisionSession.create({ data: { userId: ctx.userId, kind: "spaced", scheduledFor: new Date() } })).id : session.id;
      }
    }
    if (ids.length === 0) throw conflict("NOTHING_TO_PRACTISE", input.source === "revision" ? "Nothing is due for revision right now." : "No matching questions to practise.");
    const first = await prisma.question.findFirstOrThrow({ where: { id: ids[0] }, select: { subjectId: true, subject: { select: { name: true } } } });
    const label = input.source === "incorrect" ? "Incorrect questions" : input.source === "revision" ? "Revision" : "Practice";
    const quiz = await createQuiz(ctx, {
      subjectId: input.subjectId ?? first.subjectId,
      title: `${label} - ${localDateKey(new Date(), ctx.tz)}`,
      mode: input.source === "questions" ? "SHORT" : "REVISION",
      questionIds: ids,
      isSaved: true,
      revisionSessionId,
    });
    return { quizId: quiz.id, count: ids.length };
  });

  r.get("/:id", async ({ userId }, req) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: param(req, "id"), userId },
      include: {
        subject: { select: { id: true, name: true } },
        topics: { select: { topic: { select: { id: true, name: true } } } },
        questions: { orderBy: { position: "asc" }, include: { question: { select: { id: true, title: true, type: true, difficulty: true, inLibrary: true, colorMark: true } } } },
        attempts: { orderBy: { startedAt: "desc" } },
      },
    });
    if (!quiz) throw notFound("Quiz not found.");
    return { quiz };
  });

  /** Save the whole quiz: it stays in My Quizzes and every question goes into the library. */
  r.post("/:id/save", async ({ userId }, req) => {
    const id = param(req, "id");
    const quiz = await prisma.quiz.findFirst({ where: { id, userId }, include: { questions: { select: { questionId: true } } } });
    if (!quiz) throw notFound("Quiz not found.");
    await prisma.$transaction([
      prisma.quiz.update({ where: { id }, data: { isSaved: true } }),
      prisma.question.updateMany({ where: { id: { in: quiz.questions.map((q) => q.questionId) }, userId }, data: { inLibrary: true } }),
    ]);
    return { ok: true, saved: quiz.questions.length };
  });

  /** Deletes the quiz and its attempts. Questions saved to the library are kept. */
  r.delete("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const quiz = await prisma.quiz.findFirst({ where: { id, userId }, include: { questions: { select: { questionId: true } } } });
    if (!quiz) throw notFound("Quiz not found.");
    const qids = quiz.questions.map((q) => q.questionId);
    await prisma.$transaction(async (tx) => {
      await tx.quiz.delete({ where: { id } });
      await tx.question.deleteMany({
        where: { id: { in: qids }, userId, inLibrary: false, quizLinks: { none: {} }, paperLinks: { none: {} }, submissions: { none: {} } },
      });
    });
  });

  /** Start (or resume) an attempt. */
  r.post("/:id/attempts", async (ctx, req) => {
    const id = param(req, "id");
    await prisma.quiz.findFirst({ where: { id, userId: ctx.userId } }).then((q) => {
      if (!q) throw notFound("Quiz not found.");
    });
    const open = await prisma.quizAttempt.findFirst({ where: { quizId: id, userId: ctx.userId, status: "IN_PROGRESS" } });
    const attempt = open ?? (await prisma.quizAttempt.create({ data: { quizId: id, userId: ctx.userId } }));
    if (!open) await logActivity(ctx, "quiz.started", { type: "quiz", id });
    return { attemptId: attempt.id, resumed: !!open };
  });

  return r.router;
}

export function attemptsRouter(limits: { evaluate: RequestHandler }) {
  const r = authedRouter();

  /** Practice history: every finished or in-progress attempt. */
  r.get("/", async ({ userId }) => {
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { quiz: { select: { id: true, title: true, mode: true, subject: { select: { name: true } }, _count: { select: { questions: true } } } } },
    });
    return { attempts };
  });

  r.get("/:id", async ({ userId }, req) => {
    const a = await loadAttempt(userId, param(req, "id"));
    return { attempt: presentAttempt(a), summary: a.status !== "IN_PROGRESS" ? summarise(a) : null };
  });

  r.patch("/:id/position", async ({ userId }, req) => {
    const index = Number((req.body as { index?: unknown }).index);
    if (!Number.isInteger(index) || index < 0 || index > 500) throw badRequest("Invalid position.");
    await prisma.quizAttempt.updateMany({ where: { id: param(req, "id"), userId, status: "IN_PROGRESS" }, data: { currentIndex: index } });
  });

  r.router.post("/:id/answers", limits.evaluate);
  r.post("/:id/answers", async (ctx, req) => {
    const attemptId = param(req, "id");
    const input = answerInput.parse(req.body);
    const a = await loadAttempt(ctx.userId, attemptId);
    if (a.status !== "IN_PROGRESS") throw conflict("ATTEMPT_CLOSED", "This attempt is already finished.");
    if (!a.quiz.questions.some((q) => q.questionId === input.questionId)) throw notFound("That question isn't in this quiz.");
    if (a.submissions.some((s) => s.questionId === input.questionId)) throw conflict("ALREADY_ANSWERED", "You've already answered this question in this attempt.");

    const q = await prisma.question.findUniqueOrThrow({ where: { id: input.questionId }, include: { subject: { select: { name: true } } } });
    const grade = await gradeAnswer(ctx.userId, q, { text: input.answerText, options: input.selectedOptionIds });
    const sub = await recordSubmission(ctx, q, { text: input.answerText, options: input.selectedOptionIds, timeSpentSecs: input.timeSpentSecs }, grade, {
      quizAttemptId: attemptId,
      revisionSessionId: a.quiz.revisionSessionId,
    });
    const question = await prisma.question.findUniqueOrThrow({ where: { id: q.id }, select: questionSelect });
    return { submission: sub, question };
  });

  r.post("/:id/submissions/:sid/self-grade", async (ctx, req) => {
    const { verdict } = selfGradeInput.parse(req.body);
    const a = await loadAttempt(ctx.userId, param(req, "id"));
    if (!a.submissions.some((s) => s.id === param(req, "sid"))) throw notFound("Answer not found.");
    return { submission: await selfGrade(ctx, param(req, "sid"), verdict, a.quiz.revisionSessionId) };
  });

  r.post("/:id/finish", async (ctx, req) => {
    const id = param(req, "id");
    const a = await loadAttempt(ctx.userId, id);
    if (a.status === "IN_PROGRESS") {
      const s = summarise(a);
      const now = new Date();
      await prisma.quizAttempt.update({
        where: { id },
        data: {
          status: "GRADED",
          submittedAt: now,
          durationSecs: Math.round((now.getTime() - a.startedAt.getTime()) / 1000),
          correctCount: s.correct,
          partialCount: s.partial,
          incorrectCount: s.incorrect,
          score: s.correct + s.partial * 0.5,
          maxScore: s.total,
        },
      });
      if (a.quiz.revisionSessionId) {
        await prisma.revisionSession.update({ where: { id: a.quiz.revisionSessionId }, data: { completedAt: now } });
      }
      await logActivity(ctx, a.quiz.mode === "REVISION" ? "revision.completed" : "quiz.completed", { type: "quiz", id: a.quizId }, { correct: s.correct, total: s.total });
    }
    const fresh = await loadAttempt(ctx.userId, id);
    return { attempt: presentAttempt(fresh), summary: summarise(fresh) };
  });

  return r.router;
}
