import type { RequestHandler } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { uploadMeta } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import { AppError, badRequest, notFound } from "../../lib/errors.ts";
import { assertOwned } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { attachment } from "../../lib/pdf.ts";
import { logger } from "../../lib/logger.ts";
import { diskStorage } from "../../storage/storage.ts";
import { aiQuestionList, importQuestionsPrompt } from "../../ai/prompts.ts";
import { generateStructured, requireProvider } from "../../ai/service.ts";
import { saveGeneratedQuestions, validateGenerated } from "../questions/service.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const TEXT_EXT = new Set([".txt", ".md", ".csv", ".json", ".go", ".py", ".java", ".js", ".ts", ".c", ".cpp", ".h", ".cs", ".rs", ".kt", ".php", ".rb", ".sql", ".sh", ".html", ".css"]);
/** Text stored for prompts; long documents are truncated (the original file is kept). */
const MAX_EXTRACTED_CHARS = 200_000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

/** Detects the real file type from its bytes; the browser-supplied MIME type is not trusted. */
function sniff(buf: Buffer, name: string): { kind: "pdf" | "text"; mime: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  const ext = extname(name).toLowerCase();
  if (TEXT_EXT.has(ext) && !buf.subarray(0, 8192).includes(0)) return { kind: "text", mime: "text/plain; charset=utf-8" };
  return null;
}

async function extract(buf: Buffer, kind: "pdf" | "text") {
  if (kind === "text") return buf.toString("utf8");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export function documentsRouter(limits: { generate: RequestHandler }) {
  const r = authedRouter();

  r.get("/", async ({ userId }, req) => {
    const documents = await prisma.uploadedDocument.findMany({
      where: {
        userId,
        kind: typeof req.query.kind === "string" ? (req.query.kind as never) : { not: "AVATAR" },
        subjectId: typeof req.query.subjectId === "string" ? req.query.subjectId : undefined,
      },
      orderBy: { createdAt: "desc" },
      omit: { extractedText: true, storageKey: true },
      include: { subject: { select: { id: true, name: true } } },
    });
    return { documents };
  });

  r.router.post("/", (req, res, next) =>
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return next(new AppError(err.code === "LIMIT_FILE_SIZE" ? 413 : 400, "UPLOAD_REJECTED", err.code === "LIMIT_FILE_SIZE" ? "Files can be at most 10 MB." : "The upload could not be read."));
      }
      next(err);
    }),
  );
  r.post("/", async ({ userId }, req) => {
    const file = req.file;
    if (!file) throw badRequest("Choose a file to upload.");
    const meta = uploadMeta.parse(req.body);
    await assertOwned("subject", userId, meta.subjectId, "Subject");
    const type = sniff(file.buffer, file.originalname);
    if (!type) throw new AppError(415, "UNSUPPORTED_FILE", "Upload a PDF or a plain-text file (.txt, .md or source code).");

    let text: string | null = null;
    let status: "DONE" | "FAILED" = "DONE";
    try {
      text = (await extract(file.buffer, type.kind)).replace(/\u0000/g, "").slice(0, MAX_EXTRACTED_CHARS);
      if (!text.trim()) status = "FAILED";
    } catch (e) {
      logger.warn({ err: e }, "document text extraction failed");
      status = "FAILED";
    }
    const storageKey = await diskStorage.put(userId, file.buffer, type.kind === "pdf" ? ".pdf" : ".txt");
    const doc = await prisma.uploadedDocument.create({
      data: {
        userId,
        subjectId: meta.subjectId ?? null,
        kind: meta.kind,
        originalName: file.originalname.slice(0, 200),
        mimeType: type.mime,
        sizeBytes: file.size,
        storageKey,
        sha256: createHash("sha256").update(file.buffer).digest("hex"),
        extractionStatus: status,
        extractedText: text,
      },
      omit: { extractedText: true, storageKey: true },
    });
    return {
      document: doc,
      extractedChars: text?.length ?? 0,
      warning: status === "FAILED" ? "We couldn't read any text from this file (it may be a scanned image). It's saved, but can't be used as AI reference material." : null,
    };
  });

  r.get("/:id/download", async ({ userId }, req, res) => {
    const doc = await prisma.uploadedDocument.findFirst({ where: { id: param(req, "id"), userId } });
    if (!doc) throw notFound("Document not found.");
    res.setHeader("content-type", doc.mimeType);
    res.setHeader("content-disposition", attachment(doc.originalName));
    res.setHeader("x-content-type-options", "nosniff");
    res.send(await diskStorage.get(doc.storageKey));
  });

  r.delete("/:id", async ({ userId }, req) => {
    const doc = await prisma.uploadedDocument.findFirst({ where: { id: param(req, "id"), userId } });
    if (!doc) throw notFound("Document not found.");
    await prisma.uploadedDocument.delete({ where: { id: doc.id } });
    await diskStorage.remove(doc.storageKey);
  });

  /** Extract the questions written in an uploaded paper into the library (AI). */
  r.router.post("/:id/import-questions", limits.generate);
  r.post("/:id/import-questions", async ({ userId }, req) => {
    const doc = await prisma.uploadedDocument.findFirst({ where: { id: param(req, "id"), userId } });
    if (!doc) throw notFound("Document not found.");
    const subjectId = String((req.body as { subjectId?: unknown }).subjectId ?? doc.subjectId ?? "");
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
    if (!subject) throw badRequest("Choose the subject these questions belong to.");
    if (!doc.extractedText?.trim()) throw new AppError(422, "NO_TEXT", "This document has no readable text to import from.");
    const resolved = await requireProvider(userId);
    const prompt = importQuestionsPrompt({ subject: subject.name, text: doc.extractedText.slice(0, 60_000) });
    const { data, requestId } = await generateStructured({
      userId,
      resolved,
      purpose: "import_questions",
      promptVersion: prompt.version,
      system: prompt.system,
      user: prompt.user,
      schema: aiQuestionList,
      maxOutputTokens: 16_000,
      temperature: 0,
    });
    const valid = validateGenerated(data.questions);
    if (!valid.length) throw new AppError(422, "AI_INVALID_OUTPUT", "No usable questions were found in this document.");
    const created = await saveGeneratedQuestions(userId, subject.id, valid, {
      language: subject.isCoding ? subject.defaultLang : null,
      source: doc.kind === "SAMPLE_PAPER" || doc.kind === "PREVIOUS_YEAR_PAPER" ? "SAMPLE_PAPER" : "IMPORTED_DOCUMENT",
      inLibrary: true,
      aiRequestId: requestId,
      sourceDocumentId: doc.id,
    });
    return { imported: created.length };
  });

  return r.router;
}
