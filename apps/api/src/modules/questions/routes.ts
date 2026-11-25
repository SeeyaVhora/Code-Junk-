import { markInput, questionInput, questionListQuery, questionPatch } from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { notFound } from "../../lib/errors.ts";
import { assertOwned, assertTopicInSubject, paginate, resolveTags } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { onMarked } from "../revision/service.ts";
import { normalizedHash } from "./service.ts";

const DIFFICULTY_ORDER = ["BEGINNER", "EASY", "INTERMEDIATE", "ADVANCED", "EXPERT"];

const listInclude = {
  subject: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { name: true } } } },
  revisionItem: { select: { nextReviewAt: true, status: true, lapses: true } },
} satisfies Prisma.QuestionInclude;

export function questionsRouter() {
  const r = authedRouter();

  r.get("/", async ({ userId }, req) => {
    const q = questionListQuery.parse(req.query);
    const where: Prisma.QuestionWhereInput = {
      userId,
      inLibrary: true,
      subjectId: q.subjectId,
      topicId: q.topicId,
      language: q.language,
      difficulty: q.difficulty,
      type: q.type,
      source: q.source,
      isFavorite: q.favorite,
      isBookmarked: q.bookmarked,
      ...(q.color ? { colorMark: q.color === "NONE" ? null : q.color } : {}),
      ...(q.incorrect ? { submissions: { some: { verdict: { in: ["INCORRECT", "PARTIAL"] } } } } : {}),
      ...(q.tag ? { tags: { some: { tag: { name: q.tag.toLowerCase() } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" } },
              { body: { contains: q.q, mode: "insensitive" } },
              { personalNotes: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.QuestionOrderByWithRelationInput[] =
      q.sort === "oldest" ? [{ createdAt: "asc" }] : q.sort === "title" ? [{ title: "asc" }] : [{ createdAt: "desc" }];
    // Difficulty is an enum whose DB order matches DIFFICULTY_ORDER, so it sorts correctly.
    if (q.sort === "difficulty") orderBy.unshift({ difficulty: "asc" });
    const rows = await prisma.question.findMany({
      where,
      orderBy: [...orderBy, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: listInclude,
      omit: { solution: true, expectedAnswer: true, explanation: true, evaluationCriteria: true, starterCode: true },
    });
    const page = paginate(rows, q.limit);
    const total = q.cursor ? undefined : await prisma.question.count({ where });
    return { items: page.items.map((x) => ({ ...x, tags: x.tags.map((t) => t.tag.name) })), nextCursor: page.nextCursor, total };
  });

  r.get("/stats", async ({ userId }) => {
    const base = { userId, inLibrary: true };
    const [total, green, yellow, red, favorites, incorrect, subjects, imported] = await Promise.all([
      prisma.question.count({ where: base }),
      prisma.question.count({ where: { ...base, colorMark: "GREEN" } }),
      prisma.question.count({ where: { ...base, colorMark: "YELLOW" } }),
      prisma.question.count({ where: { ...base, colorMark: "RED" } }),
      prisma.question.count({ where: { ...base, isFavorite: true } }),
      prisma.question.count({ where: { ...base, submissions: { some: { verdict: { in: ["INCORRECT", "PARTIAL"] } } } } }),
      prisma.question.groupBy({ by: ["subjectId"], where: base }).then((g) => g.length),
      prisma.question.count({ where: { ...base, source: { in: ["IMPORTED_DOCUMENT", "SAMPLE_PAPER", "EXTERNAL_PLATFORM"] } } }),
    ]);
    const due = await prisma.revisionItem.count({ where: { userId, status: { not: "SUSPENDED" }, nextReviewAt: { lte: new Date() } } });
    return { total, green, yellow, red, favorites, incorrect, subjects, imported, dueForRevision: due };
  });

  /** Questions answered wrongly or partly, with the learner's last answer and revision schedule. */
  r.get("/incorrect", async ({ userId }, req) => {
    const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
    const questions = await prisma.question.findMany({
      where: { userId, subjectId, submissions: { some: { verdict: { in: ["INCORRECT", "PARTIAL"] } } } },
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        revisionItem: { select: { nextReviewAt: true, status: true, lapses: true, repetitions: true } },
        submissions: { orderBy: { submittedAt: "desc" }, select: { verdict: true, answerText: true, selectedOptionIds: true, submittedAt: true } },
      },
    });
    const items = questions
      .map(({ submissions, ...q }) => ({
        ...q,
        options: q.options,
        lastAnswer: submissions[0] ?? null,
        wrongCount: submissions.filter((s) => s.verdict === "INCORRECT" || s.verdict === "PARTIAL").length,
        attempts: submissions.length,
        lastAttemptedAt: submissions[0]?.submittedAt ?? null,
        resolved: submissions[0]?.verdict === "CORRECT",
      }))
      .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.wrongCount - a.wrongCount);
    return { items };
  });

  r.get("/:id", async ({ userId }, req) => {
    const q = await prisma.question.findFirst({
      where: { id: param(req, "id"), userId },
      include: {
        ...listInclude,
        sourceDocument: { select: { id: true, originalName: true } },
        revisionItem: { include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 20 } } },
        submissions: { orderBy: { submittedAt: "desc" }, take: 50 },
        quizLinks: { select: { quiz: { select: { id: true, title: true } } } },
      },
    });
    if (!q) throw notFound("Question not found.");
    return { question: { ...q, tags: q.tags.map((t) => t.tag.name) } };
  });

  r.post("/", async ({ userId }, req) => {
    const { tags, ...input } = questionInput.parse(req.body);
    await assertOwned("subject", userId, input.subjectId, "Subject");
    await assertTopicInSubject(userId, input.topicId, input.subjectId);
    const tagIds = await resolveTags(userId, tags);
    const q = await prisma.question.create({
      data: {
        ...input,
        options: input.type === "MCQ" ? (input.options ?? []) : undefined,
        correctOptionIds: input.type === "MCQ" ? input.correctOptionIds : [],
        userId,
        inLibrary: true,
        normalizedHash: normalizedHash(input.body),
        colorMarkedAt: input.colorMark ? new Date() : null,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    if (input.colorMark) await onMarked(userId, q.id, input.colorMark);
    return { question: q };
  });

  r.patch("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const { tags, ...input } = questionPatch.parse(req.body);
    const existing = await prisma.question.findFirst({ where: { id, userId } });
    if (!existing) throw notFound("Question not found.");
    const subjectId = input.subjectId ?? existing.subjectId;
    if (input.subjectId) await assertOwned("subject", userId, input.subjectId, "Subject");
    if (input.topicId) await assertTopicInSubject(userId, input.topicId, subjectId);
    const data: Prisma.QuestionUpdateInput = {
      ...input,
      options: input.options === null ? undefined : input.options,
      ...(input.subjectId && input.subjectId !== existing.subjectId && input.topicId === undefined ? { topic: { disconnect: true } } : {}),
      ...(input.body ? { normalizedHash: normalizedHash(input.body) } : {}),
      ...(input.colorMark !== undefined ? { colorMarkedAt: input.colorMark ? new Date() : null } : {}),
    };
    // Relation ids can't be mixed with connect/disconnect in Prisma's checked input; map them.
    const { subjectId: sid, topicId: tid, ...rest } = data as Prisma.QuestionUpdateInput & { subjectId?: string; topicId?: string | null };
    const q = await prisma.$transaction(async (tx) => {
      if (tags) {
        const tagIds = await resolveTags(userId, tags);
        await tx.questionTag.deleteMany({ where: { questionId: id } });
        await tx.questionTag.createMany({ data: tagIds.map((tagId) => ({ questionId: id, tagId })) });
      }
      return tx.question.update({
        where: { id },
        data: {
          ...rest,
          ...(sid ? { subject: { connect: { id: sid } } } : {}),
          ...(tid !== undefined ? (tid ? { topic: { connect: { id: tid } } } : { topic: { disconnect: true } }) : {}),
        },
      });
    });
    if (input.colorMark) await onMarked(userId, id, input.colorMark);
    return { question: q };
  });

  r.patch("/:id/mark", async ({ userId }, req) => {
    const id = param(req, "id");
    const { colorMark } = markInput.parse(req.body);
    const res = await prisma.question.updateMany({
      where: { id, userId },
      data: { colorMark, colorMarkedAt: colorMark ? new Date() : null },
    });
    if (res.count === 0) throw notFound("Question not found.");
    await onMarked(userId, id, colorMark);
    return { ok: true, colorMark };
  });

  /**
   * Removes the question from the library. If a quiz or paper still uses it, the row is
   * kept (attempt history stays intact) and only hidden from the library.
   */
  r.delete("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const q = await prisma.question.findFirst({
      where: { id, userId },
      select: { id: true, _count: { select: { quizLinks: true, paperLinks: true } } },
    });
    if (!q) throw notFound("Question not found.");
    if (q._count.quizLinks + q._count.paperLinks > 0) {
      await prisma.question.update({ where: { id }, data: { inLibrary: false } });
    } else {
      await prisma.question.delete({ where: { id } });
    }
  });

  return r.router;
}

export { DIFFICULTY_ORDER };
