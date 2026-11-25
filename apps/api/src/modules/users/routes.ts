import { aiCredentialInput, AI_PROVIDERS, changePasswordInput, deleteAccountInput, preferencesPatch, profilePatch, type AiProviderName } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import { AppError, badRequest, notFound } from "../../lib/errors.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { hashPassword, verifyPassword } from "../../lib/password.ts";
import { attachment } from "../../lib/pdf.ts";
import { encryptSecret } from "../../ai/crypto.ts";
import { providerStatus } from "../../ai/service.ts";
import { diskStorage } from "../../storage/storage.ts";
import { clearSessionCookie } from "../../middleware/cookies.ts";
import { authOf } from "../../middleware/session.ts";

export function usersRouter() {
  const r = authedRouter();

  r.get("/me", async ({ userId }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true, preferences: true },
    });
    return { user, aiProviders: await providerStatus(userId) };
  });

  r.patch("/me", async ({ userId }, req) => {
    const input = profilePatch.parse(req.body);
    return { user: await prisma.user.update({ where: { id: userId }, data: input, select: { id: true, email: true, name: true, avatarUrl: true } }) };
  });

  r.patch("/me/preferences", async ({ userId }, req) => {
    const input = preferencesPatch.parse(req.body);
    if (input.defaultSubjectIds?.length) {
      const owned = await prisma.subject.count({ where: { id: { in: input.defaultSubjectIds }, userId } });
      if (owned !== input.defaultSubjectIds.length) throw notFound("Some subjects were not found.");
    }
    return { preferences: await prisma.userPreferences.upsert({ where: { userId }, create: { userId, ...input }, update: input }) };
  });

  /** Changing the password signs out every other session. */
  r.post("/me/password", async ({ userId }, req) => {
    const { currentPassword, newPassword } = changePasswordInput.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) throw new AppError(400, "WRONG_PASSWORD", "Your current password is incorrect.");
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await prisma.session.deleteMany({ where: { userId, id: { not: authOf(req).sessionId } } });
    return { ok: true };
  });

  /** Stores the user's own provider key encrypted. Only the last 4 characters are ever returned. */
  r.put("/me/ai-credentials/:provider", async ({ userId }, req) => {
    const provider = param(req, "provider").toUpperCase() as AiProviderName;
    if (!AI_PROVIDERS.includes(provider)) throw badRequest("Unknown AI provider.");
    const { apiKey, model } = aiCredentialInput.parse(req.body);
    await prisma.aiCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedKey: encryptSecret(apiKey), keyLast4: apiKey.slice(-4), model },
      update: { encryptedKey: encryptSecret(apiKey), keyLast4: apiKey.slice(-4), model },
    });
    return { providers: await providerStatus(userId) };
  });

  r.delete("/me/ai-credentials/:provider", async ({ userId }, req) => {
    const provider = param(req, "provider").toUpperCase() as AiProviderName;
    await prisma.aiCredential.deleteMany({ where: { userId, provider } });
  });

  /** Everything the user has stored, as one JSON file. Secrets are excluded. */
  r.get("/me/export", async ({ userId }, _req, res) => {
    const [user, subjects, snippets, collections, questions, quizzes, attempts, submissions, revision, papers, paperAttempts, goals, sessions, focus, events, documents] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, createdAt: true, preferences: true } }),
      prisma.subject.findMany({ where: { userId }, include: { topics: true } }),
      prisma.codeSnippet.findMany({ where: { userId }, include: { tags: { select: { tag: { select: { name: true } } } } } }),
      prisma.codeCollection.findMany({ where: { userId } }),
      prisma.question.findMany({ where: { userId }, include: { tags: { select: { tag: { select: { name: true } } } } } }),
      prisma.quiz.findMany({ where: { userId }, include: { questions: true } }),
      prisma.quizAttempt.findMany({ where: { userId } }),
      prisma.answerSubmission.findMany({ where: { userId } }),
      prisma.revisionItem.findMany({ where: { userId }, include: { reviews: true } }),
      prisma.practicePaper.findMany({ where: { userId }, include: { sections: true, questions: true } }),
      prisma.paperAttempt.findMany({ where: { userId } }),
      prisma.learningGoal.findMany({ where: { userId }, include: { milestones: true } }),
      prisma.learningSession.findMany({ where: { userId } }),
      prisma.focusSession.findMany({ where: { userId } }),
      prisma.calendarEvent.findMany({ where: { userId }, include: { examination: true, assignment: true } }),
      prisma.uploadedDocument.findMany({ where: { userId }, omit: { storageKey: true } }),
    ]);
    const body = { exportedAt: new Date().toISOString(), format: "code-junk-export/1", user, subjects, collections, snippets, questions, quizzes, attempts, submissions, revision, papers, paperAttempts, goals, sessions, focus, events, documents };
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("content-disposition", attachment(`code-junk-export-${new Date().toISOString().slice(0, 10)}.json`));
    res.send(JSON.stringify(body, null, 2));
  });

  /** Permanently deletes the account and every record and file it owns. */
  r.delete("/me", async ({ userId }, req, res) => {
    const { password } = deleteAccountInput.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await verifyPassword(user.passwordHash, password))) throw new AppError(400, "WRONG_PASSWORD", "Your password is incorrect.");
    const files = await prisma.uploadedDocument.findMany({ where: { userId }, select: { storageKey: true } });
    await prisma.user.delete({ where: { id: userId } });
    await Promise.all(files.map((f) => diskStorage.remove(f.storageKey).catch(() => {})));
    clearSessionCookie(res);
    res.status(204).end();
  });

  return r.router;
}

export function searchRouter() {
  const r = authedRouter();
  /** Global search across every module, grouped by type. */
  r.get("/", async ({ userId }, req) => {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    if (q.length < 2) return { q, groups: [] };
    const has = { contains: q, mode: "insensitive" as const };
    const take = 6;
    const [snippets, subjects, topics, questions, quizzes, papers, goals, events] = await Promise.all([
      prisma.codeSnippet.findMany({ where: { userId, OR: [{ title: has }, { description: has }, { code: has }] }, take, select: { id: true, title: true, language: true, subject: { select: { name: true } } } }),
      prisma.subject.findMany({ where: { userId, name: has }, take, select: { id: true, name: true } }),
      prisma.topic.findMany({ where: { userId, name: has }, take, select: { id: true, name: true, subject: { select: { id: true, name: true } } } }),
      prisma.question.findMany({ where: { userId, inLibrary: true, OR: [{ title: has }, { body: has }] }, take, select: { id: true, title: true, subject: { select: { name: true } } } }),
      prisma.quiz.findMany({ where: { userId, title: has }, take, select: { id: true, title: true } }),
      prisma.practicePaper.findMany({ where: { userId, title: has }, take, select: { id: true, title: true } }),
      prisma.learningGoal.findMany({ where: { userId, title: has }, take, select: { id: true, title: true } }),
      prisma.calendarEvent.findMany({ where: { userId, title: has }, take, orderBy: { startsAt: "desc" }, select: { id: true, title: true, category: true, startsAt: true } }),
    ]);
    const groups = [
      { type: "snippet", label: "Code snippets", items: snippets.map((s) => ({ id: s.id, title: s.title, meta: s.subject.name, href: `/app/booklet/snippets/${s.id}` })) },
      { type: "subject", label: "Subjects", items: subjects.map((s) => ({ id: s.id, title: s.name, meta: "Subject", href: `/app/booklet/subjects/${s.id}` })) },
      { type: "topic", label: "Topics", items: topics.map((t) => ({ id: t.id, title: t.name, meta: t.subject.name, href: `/app/booklet/subjects/${t.subject.id}?topic=${t.id}` })) },
      { type: "question", label: "Questions", items: questions.map((x) => ({ id: x.id, title: x.title, meta: x.subject.name, href: `/app/library/questions/${x.id}` })) },
      { type: "quiz", label: "Quizzes", items: quizzes.map((x) => ({ id: x.id, title: x.title, meta: "Quiz", href: `/app/practice/quizzes/${x.id}` })) },
      { type: "paper", label: "Practice papers", items: papers.map((x) => ({ id: x.id, title: x.title, meta: "Paper", href: `/app/papers/${x.id}` })) },
      { type: "goal", label: "Learning goals", items: goals.map((x) => ({ id: x.id, title: x.title, meta: "Goal", href: `/app/planner/goals/${x.id}` })) },
      { type: "event", label: "Calendar", items: events.map((x) => ({ id: x.id, title: x.title, meta: x.startsAt.toISOString().slice(0, 10), href: `/app/calendar?event=${x.id}` })) },
    ].filter((g) => g.items.length);
    return { q, groups };
  });
  return r.router;
}
