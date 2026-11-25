import {
  collectionInput,
  collectionPatch,
  subjectInput,
  subjectPatch,
  topicInput,
  topicPatch,
  topicReorder,
} from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { assertOwned, slugify } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";

async function uniqueSubjectSlug(userId: string, name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.subject.findFirst({ where: { userId, slug, NOT: exceptId ? { id: exceptId } : undefined } });
    if (!clash) return slug;
  }
  throw conflict("SLUG_TAKEN", "Too many subjects with this name.");
}

async function ensureTopicNameFree(userId: string, subjectId: string, name: string, parentId: string | null, exceptId?: string) {
  const clash = await prisma.topic.findFirst({
    where: { userId, subjectId, parentId, slug: slugify(name), NOT: exceptId ? { id: exceptId } : undefined },
  });
  if (clash) throw conflict("TOPIC_EXISTS", "This subject already has a topic with that name.");
}

export function subjectsRouter() {
  const r = authedRouter();

  r.get("/", async ({ userId }) => {
    const subjects = await prisma.subject.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        topics: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, parentId: true, position: true } },
        _count: { select: { snippets: true, questions: { where: { inLibrary: true } }, collections: true } },
      },
    });
    return { subjects };
  });

  r.get("/:id", async ({ userId }, req) => {
    const subject = await prisma.subject.findFirst({
      where: { id: param(req, "id"), userId },
      include: {
        topics: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: { _count: { select: { snippets: true, questions: { where: { inLibrary: true } } } } },
        },
        collections: { orderBy: { position: "asc" }, include: { _count: { select: { snippets: true } } } },
        _count: { select: { snippets: true, questions: { where: { inLibrary: true } }, collections: true } },
      },
    });
    if (!subject) throw notFound("Subject not found.");
    return { subject };
  });

  /** What deleting this subject would remove, shown in the confirmation dialog. */
  r.get("/:id/impact", async ({ userId }, req) => {
    const id = param(req, "id");
    await assertOwned("subject", userId, id, "Subject");
    const [snippets, questions, quizzes, papers, topics, unlinked] = await Promise.all([
      prisma.codeSnippet.count({ where: { userId, subjectId: id } }),
      prisma.question.count({ where: { userId, subjectId: id } }),
      prisma.quiz.count({ where: { userId, subjectId: id } }),
      prisma.practicePaper.count({ where: { userId, subjectId: id } }),
      prisma.topic.count({ where: { userId, subjectId: id } }),
      prisma.learningSession.count({ where: { userId, subjectId: id } }).then(async (s) =>
        s + (await prisma.learningGoal.count({ where: { userId, subjectId: id } })) + (await prisma.calendarEvent.count({ where: { userId, subjectId: id } })),
      ),
    ]);
    return { deletes: { snippets, questions, quizzes, papers, topics }, keepsButUnlinks: unlinked };
  });

  r.post("/", async ({ userId }, req) => {
    const input = subjectInput.parse(req.body);
    const position = await prisma.subject.count({ where: { userId } });
    const subject = await prisma.subject.create({
      data: { ...input, userId, slug: await uniqueSubjectSlug(userId, input.name), position },
      include: { topics: true },
    });
    return { subject };
  });

  r.patch("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const input = subjectPatch.parse(req.body);
    await assertOwned("subject", userId, id, "Subject");
    const subject = await prisma.subject.update({
      where: { id },
      data: { ...input, ...(input.name ? { slug: await uniqueSubjectSlug(userId, input.name, id) } : {}) },
    });
    return { subject };
  });

  /**
   * Snippets, questions, quizzes and papers belong to the subject and are deleted with it
   * (the client shows /impact first). Goals, sessions and calendar events are kept and
   * simply lose their subject link.
   */
  r.delete("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    await assertOwned("subject", userId, id, "Subject");
    await prisma.subject.delete({ where: { id } });
  });

  // ── Topics ──
  r.post("/:id/topics", async ({ userId }, req) => {
    const subjectId = param(req, "id");
    const input = topicInput.parse(req.body);
    await assertOwned("subject", userId, subjectId, "Subject");
    if (input.parentId) {
      const parent = await prisma.topic.findFirst({ where: { id: input.parentId, userId, subjectId } });
      if (!parent) throw notFound("Parent topic not found.");
    }
    await ensureTopicNameFree(userId, subjectId, input.name, input.parentId ?? null);
    const position = await prisma.topic.count({ where: { subjectId, parentId: input.parentId ?? null } });
    const topic = await prisma.topic.create({
      data: { userId, subjectId, name: input.name, slug: slugify(input.name), parentId: input.parentId ?? null, position },
    });
    return { topic };
  });

  r.post("/:id/topics/reorder", async ({ userId }, req) => {
    const subjectId = param(req, "id");
    const { ids } = topicReorder.parse(req.body);
    const owned = await prisma.topic.count({ where: { id: { in: ids }, userId, subjectId } });
    if (owned !== ids.length) throw notFound("Some topics were not found.");
    await prisma.$transaction(ids.map((tid, i) => prisma.topic.update({ where: { id: tid }, data: { position: i } })));
  });

  return r.router;
}

export function topicsRouter() {
  const r = authedRouter();

  r.patch("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const input = topicPatch.parse(req.body);
    const topic = await prisma.topic.findFirst({ where: { id, userId } });
    if (!topic) throw notFound("Topic not found.");
    if (input.name) await ensureTopicNameFree(userId, topic.subjectId, input.name, topic.parentId, id);
    return {
      topic: await prisma.topic.update({
        where: { id },
        data: { ...(input.name ? { name: input.name, slug: slugify(input.name) } : {}), position: input.position },
      }),
    };
  });

  /** Snippets and questions keep existing; they just lose the topic. */
  r.delete("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    await assertOwned("topic", userId, id, "Topic");
    await prisma.topic.delete({ where: { id } });
  });

  return r.router;
}

export function collectionsRouter() {
  const r = authedRouter();

  r.get("/", async ({ userId }) => ({
    collections: await prisma.codeCollection.findMany({
      where: { userId },
      orderBy: [{ subject: { position: "asc" } }, { position: "asc" }],
      include: { subject: { select: { id: true, name: true } }, _count: { select: { snippets: true } } },
    }),
  }));

  r.post("/", async ({ userId }, req) => {
    const input = collectionInput.parse(req.body);
    await assertOwned("subject", userId, input.subjectId, "Subject");
    const position = await prisma.codeCollection.count({ where: { userId, subjectId: input.subjectId } });
    return { collection: await prisma.codeCollection.create({ data: { ...input, userId, position } }) };
  });

  r.patch("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const input = collectionPatch.parse(req.body);
    await assertOwned("codeCollection", userId, id, "Collection");
    if (input.subjectId) await assertOwned("subject", userId, input.subjectId, "Subject");
    return { collection: await prisma.codeCollection.update({ where: { id }, data: input }) };
  });

  /** Snippets stay in the booklet; they're just no longer grouped. */
  r.delete("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    await assertOwned("codeCollection", userId, id, "Collection");
    await prisma.codeCollection.delete({ where: { id } });
  });

  return r.router;
}

export function tagsRouter() {
  const r = authedRouter();
  r.get("/", async ({ userId }) => ({
    tags: await prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { snippets: true, questions: true } } },
    }),
  }));
  return r.router;
}
