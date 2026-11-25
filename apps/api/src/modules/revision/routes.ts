import { revisionOverride } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import { notFound } from "../../lib/errors.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { localDayRange } from "../../lib/time.ts";
import { providerStatus } from "../../ai/service.ts";
import { revisionSummary } from "./service.ts";

export function revisionRouter() {
  const r = authedRouter();

  r.get("/summary", async (ctx) => revisionSummary(ctx));

  /** The revision queue, grouped by when each item is due. */
  r.get("/queue", async (ctx) => {
    const { start, end } = localDayRange(new Date(), ctx.tz);
    const items = await prisma.revisionItem.findMany({
      where: { userId: ctx.userId },
      orderBy: { nextReviewAt: "asc" },
      take: 300,
      include: {
        question: { select: { id: true, title: true, type: true, difficulty: true, colorMark: true, subject: { select: { id: true, name: true } }, topic: { select: { name: true } } } },
      },
    });
    const bucket = (d: Date) => (d < start ? "overdue" : d < end ? "today" : "upcoming");
    return { items: items.map((i) => ({ ...i, bucket: i.status === "SUSPENDED" ? "suspended" : bucket(i.nextReviewAt) })) };
  });

  /** Learner override of the next review date. */
  r.patch("/items/:questionId", async ({ userId }, req) => {
    const { nextReviewAt } = revisionOverride.parse(req.body);
    const res = await prisma.revisionItem.updateMany({
      where: { questionId: param(req, "questionId"), userId },
      data: { nextReviewAt: new Date(nextReviewAt), dueOverridden: true },
    });
    if (res.count === 0) throw notFound("This question isn't in your revision queue.");
    return { ok: true };
  });

  r.get("/sessions", async ({ userId }) => {
    const sessions = await prisma.revisionSession.findMany({
      where: { userId },
      orderBy: { scheduledFor: "desc" },
      take: 30,
      include: {
        quiz: { select: { id: true, attempts: { select: { id: true, correctCount: true, partialCount: true, incorrectCount: true, status: true } }, _count: { select: { questions: true } } } },
      },
    });
    return { sessions };
  });

  return r.router;
}

export function aiRouter() {
  const r = authedRouter();
  r.get("/providers", async ({ userId }) => ({ providers: await providerStatus(userId) }));
  return r.router;
}
