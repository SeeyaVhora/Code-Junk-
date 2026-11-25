import { createHash } from "node:crypto";
import type { AiProviderName, ColorMark, QuestionSource, Verdict } from "@code-junk/shared";
import type { Prisma, Question } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../lib/errors.ts";
import { slugify, type UserCtx } from "../../lib/context.ts";
import { evaluateAnswerPrompt, aiEvaluation, type AiQuestion } from "../../ai/prompts.ts";
import { generateStructured, resolveProvider } from "../../ai/service.ts";
import { recordOutcome } from "../revision/service.ts";

export function normalizedHash(body: string) {
  const norm = body.toLowerCase().replace(/\s+/g, " ").replace(/[^\w ]/g, "").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/** Maps topic names (from AI output or custom input) to the subject's topics, creating missing ones. */
export async function topicIdsByName(userId: string, subjectId: string, names: string[]) {
  const existing = await prisma.topic.findMany({ where: { userId, subjectId, parentId: null }, select: { id: true, name: true, slug: true } });
  const map = new Map(existing.map((t) => [t.slug, t.id]));
  for (const raw of names) {
    const name = raw.trim().slice(0, 80);
    const slug = slugify(name);
    if (!name || map.has(slug)) continue;
    const t = await prisma.topic.create({ data: { userId, subjectId, name, slug, position: map.size } });
    map.set(slug, t.id);
  }
  return (name: string | null | undefined) => (name ? (map.get(slugify(name)) ?? null) : null);
}

/**
 * Validates AI-generated questions before saving: MCQ keys must point at real options,
 * duplicates (same normalised text) are dropped, and the batch fails if most items are unusable.
 */
export function validateGenerated(items: AiQuestion[]) {
  const seen = new Set<string>();
  const ok: AiQuestion[] = [];
  for (const q of items) {
    const hash = normalizedHash(q.body);
    if (seen.has(hash)) continue;
    if (q.type === "MCQ") {
      const opts = q.options ?? [];
      const ids = new Set(opts.map((o) => o.id));
      const keys = q.correctOptionIds ?? [];
      if (opts.length < 2 || ids.size !== opts.length || keys.length === 0 || keys.some((k) => !ids.has(k))) continue;
    } else if (!q.expectedAnswer && !q.solution) {
      continue; // nothing to grade against
    }
    seen.add(hash);
    ok.push(q);
  }
  return ok;
}

export async function saveGeneratedQuestions(
  userId: string,
  subjectId: string,
  items: AiQuestion[],
  opts: { language: string | null; source: QuestionSource; inLibrary: boolean; aiRequestId?: string; sourceDocumentId?: string; fallbackTopicId?: string | null },
) {
  const topicOf = await topicIdsByName(userId, subjectId, items.map((q) => q.topic ?? "").filter(Boolean));
  const created: Question[] = [];
  for (const q of items) {
    created.push(
      await prisma.question.create({
        data: {
          userId,
          subjectId,
          topicId: topicOf(q.topic) ?? opts.fallbackTopicId ?? null,
          language: opts.language,
          difficulty: q.difficulty,
          type: q.type,
          title: q.title,
          body: q.body,
          options: q.type === "MCQ" ? (q.options ?? []) : undefined,
          correctOptionIds: q.type === "MCQ" ? (q.correctOptionIds ?? []) : [],
          expectedAnswer: q.expectedAnswer ?? null,
          solution: q.solution ?? null,
          explanation: q.explanation,
          evaluationCriteria: q.evaluationCriteria ?? undefined,
          concepts: q.concepts ?? [],
          defaultMarks: q.marks ?? null,
          source: opts.source,
          sourceDocumentId: opts.sourceDocumentId,
          aiRequestId: opts.aiRequestId,
          inLibrary: opts.inLibrary,
          normalizedHash: normalizedHash(q.body),
        },
      }),
    );
  }
  return created;
}

// ── Grading ───────────────────────────────────────────────────────────────

export interface GradeResult {
  verdict: Verdict;
  method: "DETERMINISTIC" | "AI_RUBRIC" | "SELF_ASSESSED";
  score: number; // 0..1 fraction of the marks
  feedback: string | null;
  mistakes?: unknown;
  criteriaResults?: unknown;
  concepts?: string[];
  improvements?: string[];
  aiRequestId?: string;
}

const normOutput = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

/**
 * MCQs and output prediction are graded deterministically. Everything else is graded
 * by the AI against a rubric if a provider is available; otherwise the submission is
 * left for the learner to self-assess after seeing the reference answer.
 */
export async function gradeAnswer(
  userId: string,
  q: Question & { subject: { name: string } },
  answer: { text?: string; options: string[] },
  provider?: AiProviderName,
): Promise<GradeResult> {
  if (q.type === "MCQ") {
    const want = new Set(q.correctOptionIds);
    const got = new Set(answer.options);
    const right = [...got].filter((o) => want.has(o)).length;
    const wrong = got.size - right;
    const verdict: Verdict = right === want.size && wrong === 0 ? "CORRECT" : right > 0 && wrong === 0 ? "PARTIAL" : "INCORRECT";
    return {
      verdict,
      method: "DETERMINISTIC",
      score: verdict === "CORRECT" ? 1 : verdict === "PARTIAL" ? right / want.size : 0,
      feedback: verdict === "CORRECT" ? "Correct." : verdict === "PARTIAL" ? "Some of the right options, but not all of them." : "Not the right option.",
    };
  }

  const text = (answer.text ?? "").trim();
  if (!text) return { verdict: "INCORRECT", method: "DETERMINISTIC", score: 0, feedback: "No answer was given." };

  if (q.type === "OUTPUT_PREDICTION" && q.expectedAnswer) {
    const correct = normOutput(text) === normOutput(q.expectedAnswer);
    return {
      verdict: correct ? "CORRECT" : "INCORRECT",
      method: "DETERMINISTIC",
      score: correct ? 1 : 0,
      feedback: correct ? "Exactly the program's output." : "That isn't the exact output. Compare it line by line with the expected output.",
    };
  }

  const resolved = await resolveProvider(userId, provider).catch((e) => {
    if (e instanceof AppError && e.code === "AI_NOT_CONFIGURED") return null;
    throw e;
  });
  if (!resolved) return { verdict: "UNGRADED", method: "SELF_ASSESSED", score: 0, feedback: null };

  const prompt = evaluateAnswerPrompt({
    subject: q.subject.name,
    language: q.language,
    type: q.type,
    question: q.body,
    expectedAnswer: q.expectedAnswer,
    solution: q.solution,
    criteria: (q.evaluationCriteria as { criterion: string; weight: number }[] | null) ?? null,
    answer: text,
  });
  const { data, requestId } = await generateStructured({
    userId,
    resolved,
    purpose: "evaluate_answer",
    promptVersion: prompt.version,
    system: prompt.system,
    user: prompt.user,
    schema: aiEvaluation,
    maxOutputTokens: 1500,
    temperature: 0,
  });
  // Keep the verdict consistent with the score bands the rubric promises.
  const score = data.score / 100;
  const verdict: Verdict = data.verdict === "CORRECT" && score < 0.85 ? "PARTIAL" : data.verdict === "INCORRECT" && score >= 0.35 ? "PARTIAL" : data.verdict;
  return {
    verdict,
    method: "AI_RUBRIC",
    score,
    feedback: data.feedback,
    mistakes: data.mistakes,
    criteriaResults: data.criteriaResults,
    concepts: data.concepts,
    improvements: data.improvements,
    aiRequestId: requestId,
  };
}

export const suggestedMarkFor = (v: Verdict): ColorMark | null => (v === "CORRECT" ? "GREEN" : v === "PARTIAL" ? "YELLOW" : v === "INCORRECT" ? "RED" : null);

/**
 * Stores one answer (never overwriting earlier ones) and feeds the revision system.
 * A wrong answer also puts the question into the library so it can be found and revised.
 */
export async function recordSubmission(
  ctx: UserCtx,
  q: Question,
  answer: { text?: string; options: string[]; timeSpentSecs?: number },
  grade: GradeResult,
  link: { quizAttemptId?: string; paperAttemptId?: string; maxScore?: number; revisionSessionId?: string | null },
) {
  const maxScore = link.maxScore ?? 1;
  const sub = await prisma.answerSubmission.create({
    data: {
      userId: ctx.userId,
      questionId: q.id,
      quizAttemptId: link.quizAttemptId,
      paperAttemptId: link.paperAttemptId,
      answerText: answer.text ?? null,
      selectedOptionIds: answer.options,
      verdict: grade.verdict,
      gradingMethod: grade.method,
      score: grade.verdict === "UNGRADED" ? null : Math.round(grade.score * maxScore * 100) / 100,
      maxScore,
      feedback: grade.feedback,
      mistakes: (grade.mistakes as Prisma.InputJsonValue) ?? undefined,
      criteriaResults: grade.criteriaResults || grade.improvements || grade.concepts
        ? ({ criteria: grade.criteriaResults ?? [], improvements: grade.improvements ?? [], concepts: grade.concepts ?? [] } as Prisma.InputJsonValue)
        : undefined,
      suggestedMark: suggestedMarkFor(grade.verdict),
      timeSpentSecs: answer.timeSpentSecs,
      aiRequestId: grade.aiRequestId,
    },
  });
  if (grade.verdict === "INCORRECT" || grade.verdict === "PARTIAL") {
    await prisma.question.update({ where: { id: q.id }, data: { inLibrary: true } });
  }
  await recordOutcome(ctx.userId, q.id, grade.verdict, { submissionId: sub.id, revisionSessionId: link.revisionSessionId });
  return sub;
}

/** Applies a learner's self-assessment to an ungraded submission. */
export async function selfGrade(ctx: UserCtx, submissionId: string, verdict: "CORRECT" | "PARTIAL" | "INCORRECT", revisionSessionId?: string | null) {
  const sub = await prisma.answerSubmission.findFirst({ where: { id: submissionId, userId: ctx.userId } });
  if (!sub) throw new AppError(404, "NOT_FOUND", "Answer not found.");
  if (sub.verdict !== "UNGRADED") throw new AppError(409, "ALREADY_GRADED", "This answer has already been graded.");
  const fraction = verdict === "CORRECT" ? 1 : verdict === "PARTIAL" ? 0.5 : 0;
  const updated = await prisma.answerSubmission.update({
    where: { id: sub.id },
    data: { verdict, gradingMethod: "SELF_ASSESSED", score: (sub.maxScore ?? 1) * fraction, suggestedMark: suggestedMarkFor(verdict) },
  });
  if (verdict !== "CORRECT") await prisma.question.update({ where: { id: sub.questionId }, data: { inLibrary: true } });
  await recordOutcome(ctx.userId, sub.questionId, verdict, { submissionId: sub.id, revisionSessionId });
  return updated;
}

/** Fields that reveal the answer; stripped until the learner has submitted. */
export function hideAnswer<T extends Partial<Question>>(q: T) {
  const { correctOptionIds: _a, expectedAnswer: _b, solution: _c, explanation: _d, evaluationCriteria: _e, ...rest } = q;
  return rest;
}
