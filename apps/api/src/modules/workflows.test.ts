import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.ts";
import { setAiProviderForTests } from "../ai/service.ts";
import { browser, makeApp, resetDatabase, validUser } from "../../test/helpers.ts";
import { fakeAi } from "../../test/fakeAi.ts";

beforeEach(resetDatabase);
afterEach(() => setAiProviderForTests(null));
afterAll(() => prisma.$disconnect());

async function signedIn(email = validUser.email) {
  const { app } = makeApp();
  const b = await browser(app);
  const res = await b.post("/api/auth/signup", { ...validUser, email });
  expect(res.status).toBe(201);
  return { app, b };
}

async function subjectWithTopic(b: Awaited<ReturnType<typeof browser>>) {
  const s = await b.post("/api/subjects", { name: "Go", isCoding: true, defaultLang: "go" });
  expect(s.status).toBe(201);
  const t = await b.post(`/api/subjects/${s.body.subject.id}/topics`, { name: "Interfaces" });
  expect(t.status).toBe(201);
  return { subjectId: s.body.subject.id as string, topicId: t.body.topic.id as string };
}

describe("code booklet", () => {
  it("creates, lists, searches, exports and isolates snippets", async () => {
    const { app, b } = await signedIn();
    const { subjectId, topicId } = await subjectWithTopic(b);
    const created = await b.post("/api/snippets", { title: "Shapes", language: "go", code: "type Shape interface{}", subjectId, topicId, tags: ["Interfaces", "basics"] });
    expect(created.status).toBe(201);
    expect(created.body.snippet.tags.sort()).toEqual(["basics", "interfaces"]);

    const search = await b.get("/api/snippets?q=Shape");
    expect(search.body.total).toBe(1);
    const zip = await b.agent.post("/api/snippets/export").set("x-csrf-token", b.csrf).send({ subjectId, format: "zip" });
    expect(zip.status).toBe(200);
    expect(zip.headers["content-type"]).toContain("application/zip");
    const pdf = await b.agent.post("/api/snippets/export").set("x-csrf-token", b.csrf).send({ ids: [created.body.snippet.id], format: "pdf" }).buffer(true);
    expect(pdf.status).toBe(200);
    expect(String(pdf.body.subarray?.(0, 5) ?? pdf.text?.slice(0, 5))).toContain("%PDF");

    // A topic from another subject is rejected.
    const other = await b.post("/api/subjects", { name: "Python" });
    const bad = await b.post("/api/snippets", { title: "x", language: "go", code: "x", subjectId: other.body.subject.id, topicId });
    expect(bad.status).toBe(404);

    // Another user can't see or change it.
    const stranger = await browser(app);
    await stranger.post("/api/auth/signup", { ...validUser, email: "eve@example.com" });
    expect((await stranger.get(`/api/snippets/${created.body.snippet.id}`)).status).toBe(404);
    expect((await stranger.post(`/api/snippets/${created.body.snippet.id}/duplicate`)).status).toBe(404);
    expect((await stranger.get("/api/snippets")).body.total).toBe(0);

    // Deleting the subject removes its snippets.
    expect((await b.agent.delete(`/api/subjects/${subjectId}`).set("x-csrf-token", b.csrf)).status).toBe(204);
    expect(await prisma.codeSnippet.count()).toBe(0);
  });

  it("rejects duplicate topic names, including top-level ones", async () => {
    const { b } = await signedIn();
    const { subjectId } = await subjectWithTopic(b);
    const dup = await b.post(`/api/subjects/${subjectId}/topics`, { name: "interfaces" });
    expect(dup.status).toBe(409);
  });
});

describe("AI practice → library → revision → analytics", () => {
  it("runs the full learning loop", async () => {
    setAiProviderForTests(() => fakeAi({ evaluation: "PARTIAL" }));
    const { b } = await signedIn();
    const { subjectId, topicId } = await subjectWithTopic(b);

    const gen = await b.post("/api/quizzes/generate", { mode: "SHORT", subjectId, topicIds: [topicId], difficulty: "INTERMEDIATE", count: 3, types: ["MCQ", "OUTPUT_PREDICTION", "THEORY"] });
    expect(gen.status).toBe(201);
    expect(gen.body.generated).toBe(3);
    const start = await b.post(`/api/quizzes/${gen.body.quizId}/attempts`);
    const attemptId = start.body.attemptId as string;

    const view = await b.get(`/api/attempts/${attemptId}`);
    const qs = view.body.attempt.questions as { id: string; type: string; correctOptionIds?: string[]; expectedAnswer?: string }[];
    expect(qs).toHaveLength(3);
    // Answers are hidden before submission.
    expect(qs.every((q) => q.correctOptionIds === undefined && q.expectedAnswer === undefined)).toBe(true);

    const mcq = qs.find((q) => q.type === "MCQ")!;
    const out = qs.find((q) => q.type === "OUTPUT_PREDICTION")!;
    const theory = qs.find((q) => q.type === "THEORY")!;

    const wrong = await b.post(`/api/attempts/${attemptId}/answers`, { questionId: mcq.id, selectedOptionIds: ["B"] });
    expect(wrong.body.submission.verdict).toBe("INCORRECT");
    expect(wrong.body.submission.gradingMethod).toBe("DETERMINISTIC");
    expect(wrong.body.question.correctOptionIds).toEqual(["A"]);
    expect((await b.post(`/api/attempts/${attemptId}/answers`, { questionId: mcq.id, selectedOptionIds: ["A"] })).status).toBe(409);

    const right = await b.post(`/api/attempts/${attemptId}/answers`, { questionId: out.id, answerText: "42\n" });
    expect(right.body.submission.verdict).toBe("CORRECT");

    const partial = await b.post(`/api/attempts/${attemptId}/answers`, { questionId: theory.id, answerText: "Some answer" });
    expect(partial.body.submission.verdict).toBe("PARTIAL");
    expect(partial.body.submission.gradingMethod).toBe("AI_RUBRIC");

    const done = await b.post(`/api/attempts/${attemptId}/finish`);
    expect(done.body.summary).toMatchObject({ total: 3, correct: 1, partial: 1, incorrect: 1, accuracy: 50 });

    // Wrong and partial answers are in the library and the revision queue; the correct one isn't.
    const lib = await b.get("/api/questions");
    expect(lib.body.total).toBe(2);
    const rev = await b.get("/api/revision/queue");
    expect(rev.body.items.map((i: { questionId: string }) => i.questionId).sort()).toEqual([mcq.id, theory.id].sort());
    const incorrect = await b.get("/api/questions/incorrect");
    const wrongMcq = incorrect.body.items.find((i: { id: string }) => i.id === mcq.id);
    expect(wrongMcq.lastAnswer.selectedOptionIds).toEqual(["B"]);
    expect(wrongMcq.wrongCount).toBe(1);

    // Mark the correct one RED: it joins the queue, due today.
    await b.agent.patch(`/api/questions/${out.id}/mark`).set("x-csrf-token", b.csrf).send({ colorMark: "RED" });
    const summary = await b.get("/api/revision/summary");
    expect(summary.body.red).toBe(1);
    expect(summary.body.dueNow).toBeGreaterThanOrEqual(1);

    // Revision session contains the red question; a correct revision answer is recorded, not deleted.
    const revQuiz = await b.post("/api/quizzes/practice", { source: "revision" });
    expect(revQuiz.status).toBe(201);
    const ra = await b.post(`/api/quizzes/${revQuiz.body.quizId}/attempts`);
    const rv = await b.get(`/api/attempts/${ra.body.attemptId}`);
    expect(rv.body.attempt.questions.map((q: { id: string }) => q.id)).toContain(out.id);
    await b.post(`/api/attempts/${ra.body.attemptId}/answers`, { questionId: out.id, answerText: "42" });
    const item = await prisma.revisionItem.findUniqueOrThrow({ where: { questionId: out.id }, include: { reviews: true } });
    expect(item.status).not.toBe("MASTERED");
    expect(item.reviews.length).toBe(1);

    // Analytics and dashboard reflect real attempts.
    const ov = await b.get("/api/analytics/overview");
    expect(ov.body).toMatchObject({ attempted: 4, correct: 2, incorrect: 1, partial: 1, quizzesCompleted: 1 });
    const dash = await b.get("/api/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.stats.attempted).toBe(4);
    expect(dash.body.stats.streak).toBe(1);
    const insights = await b.get("/api/analytics/insights");
    // Everything just answered is scheduled for tomorrow, and 4 answers is below the
    // sample size for topic judgements, so no "due" or "weak" insight may be invented yet.
    const kinds = insights.body.insights.map((i: { kind: string }) => i.kind);
    expect(kinds).not.toContain("start");
    expect(kinds).not.toContain("weak");
    expect(kinds).not.toContain("revision");
  });

  it("falls back to self-assessment when no AI provider is configured", async () => {
    setAiProviderForTests(() => null);
    const { b } = await signedIn();
    const { subjectId } = await subjectWithTopic(b);
    const gen = await b.post("/api/quizzes/generate", { mode: "SHORT", subjectId, difficulty: "EASY", count: 2, types: ["THEORY"] });
    expect(gen.status).toBe(409);
    expect(gen.body.error.code).toBe("AI_NOT_CONFIGURED");

    const q = await b.post("/api/questions", { title: "Explain interfaces", body: "Explain Go interfaces.", subjectId, difficulty: "EASY", type: "THEORY", expectedAnswer: "Sets of methods." });
    const p = await b.post("/api/quizzes/practice", { source: "questions", questionIds: [q.body.question.id] });
    const a = await b.post(`/api/quizzes/${p.body.quizId}/attempts`);
    const sub = await b.post(`/api/attempts/${a.body.attemptId}/answers`, { questionId: q.body.question.id, answerText: "They are method sets." });
    expect(sub.body.submission.verdict).toBe("UNGRADED");
    const sg = await b.post(`/api/attempts/${a.body.attemptId}/submissions/${sub.body.submission.id}/self-grade`, { verdict: "INCORRECT" });
    expect(sg.body.submission.verdict).toBe("INCORRECT");
    expect(await prisma.revisionItem.count()).toBe(1);
  });

  it("rejects AI output whose MCQ keys don't match the options", async () => {
    setAiProviderForTests(() => ({
      name: "OPENAI",
      model: "bad",
      completeJson: async () => ({ model: "bad", text: JSON.stringify({ questions: [{ title: "Bad key", body: "Pick one of these options.", type: "MCQ", difficulty: "EASY", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctOptionIds: ["Z"], explanation: "x" }] }) }),
    }));
    const { b } = await signedIn();
    const { subjectId } = await subjectWithTopic(b);
    const gen = await b.post("/api/quizzes/generate", { mode: "SHORT", subjectId, difficulty: "EASY", count: 1, types: ["MCQ"] });
    expect(gen.status).toBe(422);
    expect(await prisma.question.count()).toBe(0);
  });
});

describe("practice papers", () => {
  it("generates, autosaves, submits and scores a paper", async () => {
    setAiProviderForTests(() => fakeAi({ evaluation: "CORRECT" }));
    const { b } = await signedIn();
    const { subjectId } = await subjectWithTopic(b);
    const gen = await b.post("/api/papers/generate", {
      subjectId,
      difficulty: "MIXED",
      durationMins: 60,
      sections: [
        { title: "Section A", types: ["MCQ"], questionCount: 2, marksPerQuestion: 2 },
        { title: "Section B", types: ["THEORY"], questionCount: 1, marksPerQuestion: 10 },
      ],
    });
    expect(gen.status).toBe(201);
    expect(gen.body.totalMarks).toBe(14);
    const paperId = gen.body.paperId as string;
    const att = await b.post(`/api/papers/${paperId}/attempts`, { mode: "EXAM", feedbackTiming: "END" });
    const view = await b.get(`/api/paper-attempts/${att.body.attemptId}`);
    const pqs = view.body.paper.questions as { id: string; marks: number; question: { type: string; correctOptionIds?: string[] } }[];
    expect(pqs.every((p) => p.question.correctOptionIds === undefined)).toBe(true);

    const answers: Record<string, { text?: string; options?: string[] }> = {};
    const [m1, m2] = pqs.filter((p) => p.question.type === "MCQ");
    answers[m1!.id] = { options: ["A"] };
    answers[m2!.id] = { options: ["B"] };
    answers[pqs.find((p) => p.question.type === "THEORY")!.id] = { text: "An answer" };
    const draft = await b.agent.put(`/api/paper-attempts/${att.body.attemptId}/draft`).set("x-csrf-token", b.csrf).send({ answers, flagged: [m2!.id] });
    expect(draft.status).toBe(200);

    const sub = await b.post(`/api/paper-attempts/${att.body.attemptId}/submit`);
    expect(sub.status).toBe(201);
    expect(sub.body.results).toMatchObject({ max: 14, scored: 2 + 9.5 });
    expect((await b.post(`/api/paper-attempts/${att.body.attemptId}/submit`)).status).toBe(409);

    const pdf = await b.get(`/api/papers/${paperId}/pdf?variant=answers`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  });
});

describe("planner, calendar, notifications", () => {
  it("connects goals, sessions, calendar and dashboard", async () => {
    const { b } = await signedIn();
    const { subjectId, topicId } = await subjectWithTopic(b);
    const goal = await b.post("/api/planner/goals", { title: "Finish Go module 1", subjectId, targetDate: "2099-01-31", milestones: ["Variables", "Pointers"] });
    expect(goal.status).toBe(201);
    expect(goal.body.goal.progress).toMatchObject({ pct: 0, basis: "milestones", total: 2 });
    // The goal's target date is on the calendar.
    expect(await prisma.calendarEvent.count({ where: { category: "LEARNING_DEADLINE" } })).toBe(1);

    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const until = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const s = await b.post("/api/planner/sessions", { title: "Go practice", subjectId, topicId, goalId: goal.body.goal.id, milestoneId: goal.body.goal.milestones[0].id, startsAt, plannedMins: 30, recurrence: "DAILY", repeatUntil: until });
    expect(s.status).toBe(201);
    expect(s.body.created).toBeGreaterThanOrEqual(6);

    const cal = await b.get(`/api/calendar?from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 8 * 86_400_000).toISOString())}`);
    expect(cal.body.sessions.length).toBe(s.body.created);

    // Scheduled ≠ completed until the learner completes it.
    const first = s.body.sessionId as string;
    expect((await b.post(`/api/planner/sessions/${first}/start`)).status).toBe(201);
    expect((await b.post(`/api/planner/sessions/${first}/pause`)).status).toBe(201);
    const done = await b.post(`/api/planner/sessions/${first}/complete`, { actualMins: 25 });
    expect(done.body.session).toMatchObject({ status: "COMPLETED", actualMins: 25 });
    expect((await b.post(`/api/planner/sessions/${first}/complete`)).status).toBe(409);

    const g = await b.get(`/api/planner/goals/${goal.body.goal.id}`);
    expect(g.body.goal.status).toBe("IN_PROGRESS");
    expect(g.body.goal.progress.pct).toBe(50); // the session's milestone was ticked
    const ov = await b.get("/api/analytics/overview");
    expect(ov.body.studyHours).toBeCloseTo(0.4, 1);

    const complete = await b.agent.patch(`/api/planner/goals/${goal.body.goal.id}`).set("x-csrf-token", b.csrf).send({ status: "COMPLETED" });
    expect(complete.body.goal.status).toBe("COMPLETED");
    expect((await b.get("/api/dashboard")).body.stats.goalsCompleted).toBe(1);
  });

  it("puts exams and assignments on the dashboard and creates de-duplicated notifications", async () => {
    const { b } = await signedIn();
    const exam = await b.post("/api/calendar", { category: "EXAMINATION", title: "DBMS mid-sem", startsAt: new Date(Date.now() + 36 * 3600_000).toISOString(), venue: "Hall 2", preparationStatus: "IN_PROGRESS" });
    expect(exam.status).toBe(201);
    expect(exam.body.event.examination.venue).toBe("Hall 2");
    const asg = await b.post("/api/calendar", { category: "ASSIGNMENT", title: "OS assignment 2", startsAt: new Date(Date.now() - 3600_000).toISOString(), priority: "HIGH" });
    expect(asg.body.event.overdue).toBe(true);

    const dash = await b.get("/api/dashboard");
    expect(dash.body.deadlines.map((d: { title: string }) => d.title)).toEqual(expect.arrayContaining(["DBMS mid-sem", "OS assignment 2"]));

    const n1 = await b.get("/api/notifications");
    const n2 = await b.get("/api/notifications");
    expect(n1.body.items.length).toBeGreaterThanOrEqual(2);
    expect(n2.body.items.length).toBe(n1.body.items.length);

    // Submitting the assignment removes it from upcoming deadlines.
    const upd = await b.agent.patch(`/api/calendar/${asg.body.event.id}`).set("x-csrf-token", b.csrf).send({ submissionStatus: "SUBMITTED" });
    expect(upd.body.event.assignment.submittedAt).not.toBeNull();
    expect(upd.body.event.overdue).toBe(false);
    const dash2 = await b.get("/api/dashboard");
    expect(dash2.body.deadlines.map((d: { title: string }) => d.title)).not.toContain("OS assignment 2");

    // Deleted notifications don't come back.
    const id = n1.body.items[0].id;
    await b.agent.delete(`/api/notifications/${id}`).set("x-csrf-token", b.csrf);
    const n3 = await b.get("/api/notifications");
    expect(n3.body.items.find((i: { id: string }) => i.id === id)).toBeUndefined();
    await b.post("/api/notifications/read-all");
    expect((await b.get("/api/notifications")).body.unread).toBe(0);
  });
});

describe("settings and search", () => {
  it("stores AI keys encrypted and never returns them", async () => {
    const { b } = await signedIn();
    const put = await b.agent.put("/api/users/me/ai-credentials/openai").set("x-csrf-token", b.csrf).send({ apiKey: "sk-test-1234567890abcdef" });
    expect(put.status).toBe(200);
    expect(JSON.stringify(put.body)).not.toContain("1234567890abcdef");
    const row = await prisma.aiCredential.findFirstOrThrow();
    expect(row.encryptedKey).not.toContain("sk-test");
    expect(row.keyLast4).toBe("cdef");
    const me = await b.get("/api/users/me");
    expect(JSON.stringify(me.body)).not.toContain("sk-test");
  });

  it("searches across modules and exports everything", async () => {
    const { b } = await signedIn();
    const { subjectId } = await subjectWithTopic(b);
    await b.post("/api/snippets", { title: "Pointer basics", language: "go", code: "var p *int", subjectId });
    await b.post("/api/planner/goals", { title: "Master pointers" });
    const res = await b.get("/api/search?q=pointer");
    expect(res.body.groups.map((g: { type: string }) => g.type).sort()).toEqual(["goal", "snippet"]);
    const exp = await b.get("/api/users/me/export");
    expect(exp.status).toBe(200);
    expect(JSON.parse(exp.text).snippets).toHaveLength(1);
  });

  it("deletes the account only with the right password", async () => {
    const { b } = await signedIn();
    expect((await b.agent.delete("/api/users/me").set("x-csrf-token", b.csrf).send({ password: "nope-nope-1", confirm: "DELETE" })).status).toBe(400);
    expect((await b.agent.delete("/api/users/me").set("x-csrf-token", b.csrf).send({ password: validUser.password, confirm: "DELETE" })).status).toBe(204);
    expect(await prisma.user.count()).toBe(0);
  });
});
