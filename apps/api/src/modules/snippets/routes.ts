import JSZip from "jszip";
import { languageExt, languageLabel, snippetExport, snippetInput, snippetListQuery, snippetPatch } from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { badRequest, notFound } from "../../lib/errors.ts";
import { assertOwned, assertTopicInSubject, logActivity, paginate, resolveTags } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { attachment, renderPdf, safeFileName, type Block } from "../../lib/pdf.ts";

const include = {
  subject: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  collection: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.CodeSnippetInclude;

type Row = Prisma.CodeSnippetGetPayload<{ include: typeof include }>;
const shape = (s: Row) => ({ ...s, tags: s.tags.map((t) => t.tag.name) });

async function checkRefs(userId: string, ref: { subjectId?: string; topicId?: string | null; collectionId?: string | null }, currentSubjectId?: string) {
  const subjectId = ref.subjectId ?? currentSubjectId;
  if (ref.subjectId) await assertOwned("subject", userId, ref.subjectId, "Subject");
  if (ref.topicId && subjectId) await assertTopicInSubject(userId, ref.topicId, subjectId);
  if (ref.collectionId) {
    const c = await prisma.codeCollection.findFirst({ where: { id: ref.collectionId, userId } });
    if (!c) throw notFound("Collection not found.");
    if (subjectId && c.subjectId !== subjectId) throw badRequest("That collection belongs to a different subject.");
  }
}

export function snippetsRouter() {
  const r = authedRouter();

  r.get("/", async ({ userId }, req) => {
    const q = snippetListQuery.parse(req.query);
    const where: Prisma.CodeSnippetWhereInput = {
      userId,
      subjectId: q.subjectId,
      topicId: q.topicId,
      collectionId: q.collectionId,
      language: q.language,
      isFavorite: q.favorite,
      ...(q.tag ? { tags: { some: { tag: { name: q.tag.toLowerCase() } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" } },
              { description: { contains: q.q, mode: "insensitive" } },
              { code: { contains: q.q, mode: "insensitive" } },
              { notes: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(q.sort === "opened" ? { lastOpenedAt: { not: null } } : {}),
    };
    const orderBy: Prisma.CodeSnippetOrderByWithRelationInput[] =
      q.sort === "created"
        ? [{ createdAt: "desc" }]
        : q.sort === "title"
          ? [{ title: "asc" }]
          : q.sort === "opened"
            ? [{ lastOpenedAt: "desc" }]
            : q.sort === "booklet"
              ? [{ subject: { position: "asc" } }, { topic: { position: "asc" } }, { position: "asc" }, { createdAt: "asc" }]
              : [{ updatedAt: "desc" }];
    const rows = await prisma.codeSnippet.findMany({
      where,
      orderBy: [...orderBy, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include,
    });
    const page = paginate(rows, q.limit);
    const total = q.cursor ? undefined : await prisma.codeSnippet.count({ where });
    return { items: page.items.map(shape), nextCursor: page.nextCursor, total };
  });

  r.get("/stats", async ({ userId }) => {
    const [snippets, subjects, collections, favorites, languages] = await Promise.all([
      prisma.codeSnippet.count({ where: { userId } }),
      prisma.subject.count({ where: { userId, archivedAt: null } }),
      prisma.codeCollection.count({ where: { userId } }),
      prisma.codeSnippet.count({ where: { userId, isFavorite: true } }),
      prisma.codeSnippet.groupBy({ by: ["language"], where: { userId }, _count: true }),
    ]);
    return { snippets, subjects, collections, favorites, languages: languages.map((l) => ({ language: l.language, count: l._count })) };
  });

  r.get("/:id", async (ctx, req) => {
    const id = param(req, "id");
    const s = await prisma.codeSnippet.findFirst({ where: { id, userId: ctx.userId }, include });
    if (!s) throw notFound("Snippet not found.");
    await prisma.codeSnippet.update({ where: { id }, data: { lastOpenedAt: new Date(), updatedAt: s.updatedAt } });
    await logActivity(ctx, "snippet.opened", { type: "snippet", id });
    // Neighbours in booklet order, for previous/next page navigation.
    const order = await prisma.codeSnippet.findMany({
      where: { userId: ctx.userId, subjectId: s.subjectId },
      orderBy: [{ topic: { position: "asc" } }, { position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, title: true },
    });
    const i = order.findIndex((o) => o.id === id);
    return { snippet: shape(s), prev: order[i - 1] ?? null, next: order[i + 1] ?? null, pageNumber: i + 1, pageCount: order.length };
  });

  r.post("/", async (ctx, req) => {
    const { tags, ...input } = snippetInput.parse(req.body);
    await checkRefs(ctx.userId, input);
    const tagIds = await resolveTags(ctx.userId, tags);
    const position = await prisma.codeSnippet.count({ where: { userId: ctx.userId, subjectId: input.subjectId } });
    const s = await prisma.codeSnippet.create({
      data: { ...input, userId: ctx.userId, position, tags: { create: tagIds.map((tagId) => ({ tagId })) } },
      include,
    });
    await logActivity(ctx, "snippet.created", { type: "snippet", id: s.id });
    return { snippet: shape(s) };
  });

  r.patch("/:id", async (ctx, req) => {
    const id = param(req, "id");
    const { tags, ...input } = snippetPatch.parse(req.body);
    const existing = await prisma.codeSnippet.findFirst({ where: { id, userId: ctx.userId } });
    if (!existing) throw notFound("Snippet not found.");
    // Moving to another subject drops a topic/collection that belonged to the old one.
    const movingSubject = input.subjectId && input.subjectId !== existing.subjectId;
    const data = { ...input, ...(movingSubject && input.topicId === undefined ? { topicId: null } : {}), ...(movingSubject && input.collectionId === undefined ? { collectionId: null } : {}) };
    await checkRefs(ctx.userId, data, existing.subjectId);
    const s = await prisma.$transaction(async (tx) => {
      if (tags) {
        const tagIds = await resolveTags(ctx.userId, tags);
        await tx.snippetTag.deleteMany({ where: { snippetId: id } });
        await tx.snippetTag.createMany({ data: tagIds.map((tagId) => ({ snippetId: id, tagId })) });
      }
      return tx.codeSnippet.update({ where: { id }, data, include });
    });
    return { snippet: shape(s) };
  });

  r.post("/:id/duplicate", async (ctx, req) => {
    const id = param(req, "id");
    const s = await prisma.codeSnippet.findFirst({ where: { id, userId: ctx.userId }, include: { tags: true } });
    if (!s) throw notFound("Snippet not found.");
    const copy = await prisma.codeSnippet.create({
      data: {
        userId: ctx.userId,
        subjectId: s.subjectId,
        topicId: s.topicId,
        collectionId: s.collectionId,
        title: `${s.title} (copy)`.slice(0, 160),
        description: s.description,
        language: s.language,
        code: s.code,
        notes: s.notes,
        position: s.position + 1,
        tags: { create: s.tags.map((t) => ({ tagId: t.tagId })) },
      },
      include,
    });
    return { snippet: shape(copy) };
  });

  r.delete("/:id", async ({ userId }, req) => {
    const res = await prisma.codeSnippet.deleteMany({ where: { id: param(req, "id"), userId } });
    if (res.count === 0) throw notFound("Snippet not found.");
  });

  /** The snippet as its original source file. */
  r.get("/:id/download", async ({ userId }, req, res) => {
    const s = await prisma.codeSnippet.findFirst({ where: { id: param(req, "id"), userId } });
    if (!s) throw notFound("Snippet not found.");
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("content-disposition", attachment(`${safeFileName(s.title, "snippet")}.${languageExt(s.language)}`));
    res.send(s.code);
  });

  /** Selected snippets, a subject or a collection as a ZIP of source files or a PDF booklet. */
  r.post("/export", async ({ userId }, req, res) => {
    const input = snippetExport.parse(req.body);
    if (!input.all && !input.ids?.length && !input.subjectId && !input.collectionId) throw badRequest("Choose what to export.");
    const rows = await prisma.codeSnippet.findMany({
      where: {
        userId,
        ...(input.ids?.length ? { id: { in: input.ids } } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      },
      orderBy: [{ subject: { position: "asc" } }, { topic: { position: "asc" } }, { position: "asc" }, { createdAt: "asc" }],
      include,
    });
    if (rows.length === 0) throw notFound("No snippets matched.");
    const name =
      input.collectionId ? rows[0]!.collection?.name : input.subjectId ? rows[0]!.subject.name : input.all ? "Code Junk booklet" : rows.length === 1 ? rows[0]!.title : "Code Junk snippets";
    const base = safeFileName(name ?? "snippets", "snippets");

    if (input.format === "zip") {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const s of rows) {
        const folder = [safeFileName(s.subject.name, "subject"), s.topic ? safeFileName(s.topic.name, "topic") : null].filter(Boolean).join("/");
        let file = `${folder}/${safeFileName(s.title, "snippet")}.${languageExt(s.language)}`;
        for (let n = 2; used.has(file.toLowerCase()); n++) file = `${folder}/${safeFileName(s.title, "snippet")} (${n}).${languageExt(s.language)}`;
        used.add(file.toLowerCase());
        zip.file(file, s.code);
      }
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      res.setHeader("content-type", "application/zip");
      res.setHeader("content-disposition", attachment(`${base}.zip`));
      res.send(buf);
      return;
    }

    const blocks: Block[] = [
      { kind: "title", text: name ?? "Code Junk snippets" },
      { kind: "subtitle", text: `${rows.length} snippet${rows.length === 1 ? "" : "s"} - exported ${new Date().toISOString().slice(0, 10)}` },
      { kind: "heading", text: "Contents" },
      ...rows.map((s, i) => ({ kind: "meta" as const, text: `${i + 1}. ${s.title}  (${s.subject.name}${s.topic ? " / " + s.topic.name : ""})` })),
    ];
    rows.forEach((s, i) => {
      blocks.push({ kind: "pageBreak" }, { kind: "title", text: `${i + 1}. ${s.title}` });
      blocks.push({
        kind: "meta",
        text: [s.subject.name, s.topic?.name, languageLabel(s.language), s.tags.map((t) => "#" + t.tag.name).join(" ")].filter(Boolean).join("  -  "),
      });
      if (s.description) blocks.push({ kind: "text", text: s.description });
      blocks.push({ kind: "code", text: s.code });
      if (s.notes) blocks.push({ kind: "heading", text: "Notes" }, { kind: "text", text: s.notes });
    });
    const pdf = await renderPdf(blocks, { title: name ?? "Code Junk snippets" });
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", attachment(`${base}.pdf`));
    res.send(pdf);
  });

  return r.router;
}
