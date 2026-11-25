import type { RequestHandler } from "express";
import { answerInput, generatePaperInput, paperDraftInput, selfGradeInput, startPaperAttempt, DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, type QuestionType } from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors.ts";
import { logActivity } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { attachment, renderPdf, safeFileName, type Block } from "../../lib/pdf.ts";
import { aiQuestionList, generatePaperSectionPrompt } from "../../ai/prompts.ts";
import { generateStructured, requireProvider } from "../../ai/service.ts";
import { gradeAnswer, hideAnswer, recordSubmission, saveGeneratedQuestions, selfGrade, validateGenerated } from "../questions/service.ts";

/** Reference material sent to the AI is capped so prompts stay within model limits. */
const MATERIAL_CHARS = 24_000;

const paperInclude = {
  subject: { select: { id: true, name: true } },
  topics: { select: { topic: { select: { id: true, name: true } } } },
  materials: { select: { document: { select: { id: true, originalName: true, kind: true } } } },
  sections: { orderBy: { position: "asc" } },
  questions: {
    orderBy: { position: "asc" },
    include: { question: { include: { topic: { select: { id: true, name: true } } } } },
  },
} satisfies Prisma.PracticePaperInclude;
type PaperFull = Prisma.PracticePaperGetPayload<{ include: typeof paperInclude }>;

async function loadPaper(userId: string, id: string) {
  const p = await prisma.practicePaper.findFirst({ where: { id, userId }, include: paperInclude });
  if (!p) throw notFound("Paper not found.");
  return p;
}

function presentPaper(p: PaperFull, reveal: boolean) {
  return {
    ...p,
    questions: p.questions.map((pq) => ({ ...pq, question: reveal ? pq.question : hideAnswer(pq.question) })),
  };
}

async function loadAttempt(userId: string, id: string) {
  const a = await prisma.paperAttempt.findFirst({ where: { id, userId }, include: { submissions: { orderBy: { submittedAt: "asc" } } } });
  if (!a) throw notFound("Attempt not found.");
  return a;
}

/** Runs async tasks with limited concurrency (AI grading of a whole paper). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

function results(paper: PaperFull, a: Awaited<ReturnType<typeof loadAttempt>>) {
  const subs = new Map(a.submissions.map((s) => [s.questionId, s]));
  const topics = new Map<string, { topic: string; scored: number; max: number }>();
  let scored = 0;
  let max = 0;
  const perQuestion = paper.questions.map((pq) => {
    const s = subs.get(pq.questionId) ?? null;
    const got = s?.score ?? 0;
    scored += got;
    max += pq.marks;
    const key = pq.question.topic?.name ?? "General";
    const t = topics.get(key) ?? { topic: key, scored: 0, max: 0 };
    t.scored += got;
    t.max += pq.marks;
    topics.set(key, t);
    return { paperQuestionId: pq.id, questionId: pq.questionId, marks: pq.marks, scored: got, verdict: s?.verdict ?? null, attempted: !!s };
  });
  const byTopic = [...topics.values()].map((t) => ({ ...t, pct: t.max ? Math.round((t.scored / t.max) * 100) : 0 }));
  return {
    scored: Math.round(scored * 100) / 100,
    max,
    pct: max ? Math.round((scored / max) * 100) : 0,
    perQuestion,
    byTopic,
    weakAreas: byTopic.filter((t) => t.pct < 50).map((t) => t.topic),
    ungraded: a.submissions.filter((s) => s.verdict === "UNGRADED").length,
  };
}

export function papersRouter(limits: { generate: RequestHandler; evaluate: RequestHandler }) {
  const r = authedRouter();

  r.get("/", async ({ userId }) => {
    const papers = await prisma.practicePaper.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true } },
        _count: { select: { questions: true } },
        attempts: { orderBy: { startedAt: "desc" }, select: { id: true, mode: true, status: true, score: true, maxScore: true, startedAt: true, submittedAt: true } },
      },
    });
    return { papers };
  });

  r.get("/attempts", async ({ userId }) => {
    const attempts = await prisma.paperAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      include: { paper: { select: { id: true, title: true, totalMarks: true, subject: { select: { name: true } } } } },
    });
    return { attempts };
  });

  r.router.post("/generate", limits.generate);
  r.post("/generate", async (ctx, req) => {
    const input = generatePaperInput.parse(req.body);
    const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, userId: ctx.userId } });
    if (!subject) throw notFound("Subject not found.");
    const topics = input.topicIds.length ? await prisma.topic.findMany({ where: { id: { in: input.topicIds }, userId: ctx.userId, subjectId: subject.id } }) : [];
    if (topics.length !== input.topicIds.length) throw notFound("Some topics were not found in this subject.");
    const docs = input.documentIds.length ? await prisma.uploadedDocument.findMany({ where: { id: { in: input.documentIds }, userId: ctx.userId } }) : [];
    if (docs.length !== input.documentIds.length) throw notFound("Some documents were not found.");

    // Syllabus first, then papers, then everything else, each truncated to share the budget.
    const order = ["SYLLABUS", "PREVIOUS_YEAR_PAPER", "SAMPLE_PAPER", "REFERENCE"];
    const usable = docs.filter((d) => d.extractedText?.trim()).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const perDoc = usable.length ? Math.floor(MATERIAL_CHARS / usable.length) : 0;
    const material = usable.map((d) => `### ${d.kind.replace(/_/g, " ").toLowerCase()}: ${d.originalName}\n${d.extractedText!.slice(0, perDoc)}`).join("\n\n") || null;

    const resolved = await requireProvider(ctx.userId, input.provider);
    const language = subject.isCoding ? (input.language ?? subject.defaultLang ?? null) : null;
    const created: { questionId: string; sectionIndex: number; marks: number }[] = [];
    const titles: string[] = [];
    let requestId: string | undefined;

    for (const [index, section] of input.sections.entries()) {
      const prompt = generatePaperSectionPrompt({
        subject: subject.name,
        topics: topics.map((t) => t.name),
        language,
        difficulty: input.difficulty,
        section,
        material,
        instructions: input.instructions,
        avoidTitles: titles,
      });
      const out = await generateStructured({
        userId: ctx.userId,
        resolved,
        purpose: "generate_paper",
        promptVersion: prompt.version,
        system: prompt.system,
        user: prompt.user,
        schema: aiQuestionList,
        maxOutputTokens: Math.min(16_000, 700 * section.questionCount + 120 * section.marksPerQuestion * section.questionCount),
      });
      requestId ??= out.requestId;
      const valid = validateGenerated(out.data.questions.filter((q) => (section.types as QuestionType[]).includes(q.type)))
        .filter((q) => !titles.includes(q.title))
        .slice(0, section.questionCount);
      if (valid.length < section.questionCount) {
        throw new AppError(422, "AI_INVALID_OUTPUT", `The AI couldn't produce enough valid questions for "${section.title}". Try again or reduce the number of questions.`);
      }
      const saved = await saveGeneratedQuestions(ctx.userId, subject.id, valid, { language, source: "AI_GENERATED", inLibrary: false, aiRequestId: out.requestId });
      saved.forEach((q) => created.push({ questionId: q.id, sectionIndex: index, marks: section.marksPerQuestion }));
      titles.push(...valid.map((q) => q.title));
    }

    const totalMarks = created.reduce((s, c) => s + c.marks, 0);
    const paper = await prisma.$transaction(async (tx) => {
      const p = await tx.practicePaper.create({
        data: {
          userId: ctx.userId,
          subjectId: subject.id,
          title: input.title ?? `${subject.name} practice paper (${input.difficulty === "MIXED" ? "Mixed" : DIFFICULTY_LABEL[input.difficulty]})`,
          instructions: `Original practice paper generated by Code Junk${material ? " from your syllabus and sample papers" : ""}. Not an official examination paper. Answer all questions.`,
          language,
          difficulty: input.difficulty === "MIXED" ? null : input.difficulty,
          totalMarks,
          durationMins: input.durationMins,
          distribution: { sections: input.sections } as Prisma.InputJsonValue,
          generationNotes: input.instructions,
          aiProvider: resolved.provider.name,
          aiRequestId: requestId,
          topics: topics.length ? { create: topics.map((t) => ({ topicId: t.id })) } : undefined,
          materials: docs.length ? { create: docs.map((d) => ({ documentId: d.id })) } : undefined,
        },
      });
      const sections = await Promise.all(
        input.sections.map((s, position) =>
          tx.paperSection.create({ data: { paperId: p.id, title: s.title, position, instructions: `${s.questionCount} x ${s.marksPerQuestion} marks - ${s.types.map((t) => QUESTION_TYPE_LABEL[t]).join(", ")}` } }),
        ),
      );
      await tx.paperQuestion.createMany({
        data: created.map((c, position) => ({ paperId: p.id, sectionId: sections[c.sectionIndex]!.id, questionId: c.questionId, position, marks: c.marks })),
      });
      return p;
    });
    await logActivity(ctx, "paper.generated", { type: "paper", id: paper.id });
    return { paperId: paper.id, totalMarks, questions: created.length };
  });

  r.get("/:id", async ({ userId }, req) => {
    const p = await loadPaper(userId, param(req, "id"));
    return { paper: presentPaper(p, req.query.reveal === "true") };
  });

  /** Saving a paper puts its questions in the library too. */
  r.post("/:id/save-questions", async ({ userId }, req) => {
    const p = await loadPaper(userId, param(req, "id"));
    await prisma.question.updateMany({ where: { id: { in: p.questions.map((q) => q.questionId) }, userId }, data: { inLibrary: true } });
    return { saved: p.questions.length };
  });

  r.delete("/:id", async ({ userId }, req) => {
    const p = await loadPaper(userId, param(req, "id"));
    const qids = p.questions.map((q) => q.questionId);
    await prisma.$transaction(async (tx) => {
      await tx.practicePaper.delete({ where: { id: p.id } });
      await tx.question.deleteMany({ where: { id: { in: qids }, userId, inLibrary: false, quizLinks: { none: {} }, paperLinks: { none: {} }, submissions: { none: {} } } });
    });
  });

  r.post("/:id/attempts", async (ctx, req) => {
    const input = startPaperAttempt.parse(req.body);
    const p = await loadPaper(ctx.userId, param(req, "id"));
    const open = await prisma.paperAttempt.findFirst({ where: { paperId: p.id, userId: ctx.userId, status: "IN_PROGRESS", mode: input.mode } });
    if (open) return { attemptId: open.id, resumed: true };
    const a = await prisma.paperAttempt.create({
      data: {
        userId: ctx.userId,
        paperId: p.id,
        mode: input.mode,
        feedbackTiming: input.mode === "GUIDED" ? "IMMEDIATE" : input.feedbackTiming,
        deadlineAt: input.mode === "EXAM" ? new Date(Date.now() + p.durationMins * 60_000) : null,
        maxScore: p.totalMarks,
      },
    });
    await logActivity(ctx, "paper.started", { type: "paper", id: p.id });
    return { attemptId: a.id, resumed: false };
  });

  r.get("/:id/pdf", async ({ userId }, req, res) => {
    const variant = String(req.query.variant ?? "questions");
    if (!["questions", "answers", "full", "solved"].includes(variant)) throw badRequest("Unknown PDF variant.");
    const p = await loadPaper(userId, param(req, "id"));
    const attempt = variant === "solved" ? await loadAttempt(userId, String(req.query.attemptId ?? "")) : null;
    if (attempt && attempt.paperId !== p.id) throw notFound("Attempt not found.");
    const subs = new Map(attempt?.submissions.map((s) => [s.questionId, s]) ?? []);

    const blocks: Block[] = [
      { kind: "title", text: p.title },
      { kind: "subtitle", text: `${p.subject.name}  -  ${p.totalMarks} marks  -  ${p.durationMins} minutes${variant === "answers" ? "  -  ANSWER KEY" : variant === "solved" ? "  -  YOUR ATTEMPT" : ""}` },
      { kind: "meta", text: p.instructions ?? "" },
      { kind: "rule" },
    ];
    let n = 0;
    for (const section of p.sections) {
      blocks.push({ kind: "heading", text: section.title }, { kind: "meta", text: section.instructions ?? "" });
      for (const pq of p.questions.filter((q) => q.sectionId === section.id)) {
        n++;
        const q = pq.question;
        blocks.push({ kind: "heading", text: `Q${n}. ${q.title}  [${pq.marks} marks]` });
        if (variant !== "answers") {
          blocks.push({ kind: "text", text: q.body.replace(/```\w*\n?/g, "") });
          if (q.type === "MCQ") for (const o of (q.options as { id: string; text: string }[] | null) ?? []) blocks.push({ kind: "text", text: `(${o.id}) ${o.text}` });
        }
        if (variant === "solved") {
          const s = subs.get(q.id);
          blocks.push({ kind: "meta", text: s ? `Your answer - ${s.verdict} - ${s.score ?? 0}/${pq.marks}` : "Not attempted - 0 marks" });
          if (s?.answerText) blocks.push({ kind: "code", text: s.answerText });
          if (s?.selectedOptionIds.length) blocks.push({ kind: "text", text: `Selected: ${s.selectedOptionIds.join(", ")}` });
          if (s?.feedback) blocks.push({ kind: "text", text: `Feedback: ${s.feedback}` });
        }
        if (variant !== "questions") {
          if (q.type === "MCQ") blocks.push({ kind: "text", text: `Answer: ${q.correctOptionIds.join(", ")}` });
          if (q.expectedAnswer) blocks.push({ kind: "meta", text: "Expected answer" }, { kind: q.type === "OUTPUT_PREDICTION" ? "code" : "text", text: q.expectedAnswer });
          if (q.solution && variant !== "answers") blocks.push({ kind: "meta", text: "Solution" }, { kind: "code", text: q.solution.replace(/```\w*\n?/g, "") });
          if (q.explanation && variant !== "answers") blocks.push({ kind: "meta", text: "Explanation" }, { kind: "text", text: q.explanation });
        }
      }
    }
    const pdf = await renderPdf(blocks, { title: p.title });
    const suffix = variant === "questions" ? "" : variant === "answers" ? " - answer key" : variant === "solved" ? " - my attempt" : " - with solutions";
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", attachment(`${safeFileName(p.title, "paper")}${suffix}.pdf`));
    res.send(pdf);
  });

  return r.router;
}

export function paperAttemptsRouter(limits: { evaluate: RequestHandler }) {
  const r = authedRouter();

  r.get("/:id", async ({ userId }, req) => {
    const a = await loadAttempt(userId, param(req, "id"));
    const p = await loadPaper(userId, a.paperId);
    const done = a.status !== "IN_PROGRESS";
    const answered = new Set(a.submissions.map((s) => s.questionId));
    const paper = {
      ...p,
      // In guided mode an answered question's solution is shown straight away.
      questions: p.questions.map((pq) => ({ ...pq, question: done || answered.has(pq.questionId) ? pq.question : hideAnswer(pq.question) })),
    };
    return { attempt: a, paper, results: done ? results(p, a) : null };
  });

  /** Autosave for exam mode: answers and review flags, kept until submission. */
  r.put("/:id/draft", async ({ userId }, req) => {
    const input = paperDraftInput.parse(req.body);
    const res = await prisma.paperAttempt.updateMany({
      where: { id: param(req, "id"), userId, status: "IN_PROGRESS" },
      data: { draftAnswers: input as Prisma.InputJsonValue },
    });
    if (res.count === 0) throw conflict("ATTEMPT_CLOSED", "This attempt is no longer open.");
    return { savedAt: new Date().toISOString() };
  });

  /** Guided mode: grade one answer immediately. */
  r.router.post("/:id/answers", limits.evaluate);
  r.post("/:id/answers", async (ctx, req) => {
    const input = answerInput.parse(req.body);
    const a = await loadAttempt(ctx.userId, param(req, "id"));
    if (a.status !== "IN_PROGRESS") throw conflict("ATTEMPT_CLOSED", "This attempt is already finished.");
    if (a.feedbackTiming !== "IMMEDIATE") throw conflict("FEEDBACK_AT_END", "Answers in this attempt are evaluated when you submit the paper.");
    const pq = await prisma.paperQuestion.findFirst({ where: { paperId: a.paperId, questionId: input.questionId } });
    if (!pq) throw notFound("That question isn't in this paper.");
    if (a.submissions.some((s) => s.questionId === input.questionId)) throw conflict("ALREADY_ANSWERED", "You've already answered this question.");
    const q = await prisma.question.findUniqueOrThrow({ where: { id: input.questionId }, include: { subject: { select: { name: true } } } });
    const grade = await gradeAnswer(ctx.userId, q, { text: input.answerText, options: input.selectedOptionIds });
    const submission = await recordSubmission(ctx, q, { text: input.answerText, options: input.selectedOptionIds, timeSpentSecs: input.timeSpentSecs }, grade, { paperAttemptId: a.id, maxScore: pq.marks });
    return { submission, question: q };
  });

  r.post("/:id/submissions/:sid/self-grade", async (ctx, req) => {
    const { verdict } = selfGradeInput.parse(req.body);
    const a = await loadAttempt(ctx.userId, param(req, "id"));
    if (!a.submissions.some((s) => s.id === param(req, "sid"))) throw notFound("Answer not found.");
    const submission = await selfGrade(ctx, param(req, "sid"), verdict);
    await refreshScore(a.id);
    return { submission };
  });

  /** Submit the paper: grades every drafted answer not yet graded, then closes the attempt. */
  r.router.post("/:id/submit", limits.evaluate);
  r.post("/:id/submit", async (ctx, req) => {
    const a = await loadAttempt(ctx.userId, param(req, "id"));
    if (a.status !== "IN_PROGRESS") throw conflict("ATTEMPT_CLOSED", "This paper was already submitted.");
    const p = await loadPaper(ctx.userId, a.paperId);
    const draft = (a.draftAnswers as { answers?: Record<string, { text?: string; options?: string[] }> } | null)?.answers ?? {};
    const done = new Set(a.submissions.map((s) => s.questionId));
    const todo = p.questions.filter((pq) => !done.has(pq.questionId) && (draft[pq.id]?.text?.trim() || draft[pq.id]?.options?.length));

    // Close first so a double-click can't grade twice; reopen if grading fails outright.
    const closed = await prisma.paperAttempt.updateMany({ where: { id: a.id, status: "IN_PROGRESS" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    if (closed.count === 0) throw conflict("ATTEMPT_CLOSED", "This paper was already submitted.");
    try {
      await mapLimit(todo, 3, async (pq) => {
        const ans = { text: draft[pq.id]?.text, options: draft[pq.id]?.options ?? [] };
        const q = await prisma.question.findUniqueOrThrow({ where: { id: pq.questionId }, include: { subject: { select: { name: true } } } });
        const grade = await gradeAnswer(ctx.userId, q, ans).catch(() => ({ verdict: "UNGRADED" as const, method: "SELF_ASSESSED" as const, score: 0, feedback: "Automatic grading failed for this answer; assess it yourself against the solution." }));
        await recordSubmission(ctx, q, ans, grade, { paperAttemptId: a.id, maxScore: pq.marks });
      });
    } catch (e) {
      await prisma.paperAttempt.update({ where: { id: a.id }, data: { status: "IN_PROGRESS", submittedAt: null } });
      throw e;
    }
    await refreshScore(a.id, "GRADED");
    await logActivity(ctx, "paper.completed", { type: "paper", id: p.id });
    const fresh = await loadAttempt(ctx.userId, a.id);
    return { results: results(p, fresh) };
  });

  return r.router;
}

async function refreshScore(attemptId: string, status?: "GRADED") {
  const subs = await prisma.answerSubmission.findMany({ where: { paperAttemptId: attemptId }, select: { score: true } });
  await prisma.paperAttempt.update({
    where: { id: attemptId },
    data: { score: Math.round(subs.reduce((s, x) => s + (x.score ?? 0), 0) * 100) / 100, ...(status ? { status } : {}) },
  });
}
