import { z } from "zod";
import {
  AI_PROVIDERS,
  COLOR_MARKS,
  DIFFICULTIES,
  DOCUMENT_KINDS,
  EVENT_CATEGORIES,
  GOAL_STATUSES,
  LANGUAGE_IDS,
  PREPARATION_STATUSES,
  PRIORITIES,
  QUESTION_SOURCES,
  QUESTION_TYPES,
  SUBMISSION_STATUSES,
} from "./constants";
import { nameSchema, passwordSchema, timeZoneSchema } from "./auth";

/*
 * Request schemas for every module. The API parses with these; the web forms validate
 * with the same schemas so the two can never disagree.
 */

const id = z.string().min(1).max(40);
const optionalId = id.nullish();
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const title = (max = 160) => z.string().trim().min(1, "Required.").max(max);
const isoDate = z.iso.datetime({ offset: true, message: "Enter a valid date and time." });
const dateOnly = z.iso.date({ message: "Enter a valid date." });
const tagList = z.array(z.string().trim().min(1).max(40)).max(20).default([]);

// ── Subjects, topics, collections ──────────────────────────────────────────
export const subjectInput = z.object({
  name: title(80),
  description: optionalText(500),
  color: optionalText(20),
  isCoding: z.boolean().default(true),
  defaultLang: z.enum(LANGUAGE_IDS).nullish(),
});
export const subjectPatch = subjectInput.partial();
export type SubjectInput = z.input<typeof subjectInput>;

export const topicInput = z.object({ name: title(80), parentId: optionalId });
export const topicPatch = z.object({ name: title(80).optional(), position: z.number().int().min(0).optional() });
export const topicReorder = z.object({ ids: z.array(id).min(1).max(500) });

export const collectionInput = z.object({ name: title(80), subjectId: id, description: optionalText(500) });
export const collectionPatch = collectionInput.partial();

// ── Snippets ───────────────────────────────────────────────────────────────
export const snippetInput = z.object({
  title: title(),
  description: optionalText(2000),
  language: z.enum(LANGUAGE_IDS),
  code: z.string().min(1, "Add some code.").max(200_000, "Snippets are limited to 200,000 characters."),
  notes: optionalText(20_000),
  subjectId: id,
  topicId: optionalId,
  collectionId: optionalId,
  tags: tagList,
  isFavorite: z.boolean().optional(),
});
export const snippetPatch = snippetInput.partial();
export type SnippetInput = z.input<typeof snippetInput>;

export const snippetListQuery = z.object({
  q: text(200).optional(),
  subjectId: id.optional(),
  topicId: id.optional(),
  collectionId: id.optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
  tag: text(40).optional(),
  favorite: z.stringbool().optional(),
  sort: z.enum(["updated", "created", "title", "opened", "booklet"]).default("updated"),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const snippetExport = z.object({
  ids: z.array(id).max(1000).optional(),
  subjectId: id.optional(),
  collectionId: id.optional(),
  /** Export every snippet the user has. */
  all: z.boolean().optional(),
  format: z.enum(["zip", "pdf"]),
});

// ── Questions ──────────────────────────────────────────────────────────────
export const mcqOption = z.object({ id: z.string().min(1).max(8), text: z.string().trim().min(1).max(2000) });

export const questionInput = z
  .object({
    title: title(200),
    body: z.string().trim().min(1, "Write the question.").max(20_000),
    subjectId: id,
    topicId: optionalId,
    language: z.enum(LANGUAGE_IDS).nullish(),
    difficulty: z.enum(DIFFICULTIES),
    type: z.enum(QUESTION_TYPES),
    options: z.array(mcqOption).max(8).nullish(),
    correctOptionIds: z.array(z.string()).max(8).default([]),
    expectedAnswer: optionalText(20_000),
    solution: optionalText(50_000),
    explanation: optionalText(20_000),
    starterCode: optionalText(20_000),
    source: z.enum(QUESTION_SOURCES).default("MANUAL"),
    sourceUrl: z.url({ protocol: /^https?$/, message: "Enter a full http(s) link." }).nullish(),
    sourceAttribution: optionalText(200),
    personalNotes: optionalText(20_000),
    tags: tagList,
    colorMark: z.enum(COLOR_MARKS).nullish(),
    isFavorite: z.boolean().optional(),
    isBookmarked: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "MCQ") {
      const opts = q.options ?? [];
      if (opts.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two options." });
      if (q.correctOptionIds.length === 0)
        ctx.addIssue({ code: "custom", path: ["correctOptionIds"], message: "Choose the correct option." });
      if (q.correctOptionIds.some((c) => !opts.some((o) => o.id === c)))
        ctx.addIssue({ code: "custom", path: ["correctOptionIds"], message: "The answer must be one of the options." });
    }
  });
export const questionPatch = z.object({
  title: title(200).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  subjectId: id.optional(),
  topicId: optionalId,
  language: z.enum(LANGUAGE_IDS).nullish(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  options: z.array(mcqOption).max(8).nullish(),
  correctOptionIds: z.array(z.string()).max(8).optional(),
  expectedAnswer: optionalText(20_000),
  solution: optionalText(50_000),
  explanation: optionalText(20_000),
  starterCode: optionalText(20_000),
  sourceUrl: z.url({ protocol: /^https?$/ }).nullish(),
  sourceAttribution: optionalText(200),
  personalNotes: optionalText(20_000),
  tags: tagList.optional(),
  colorMark: z.enum(COLOR_MARKS).nullish(),
  isFavorite: z.boolean().optional(),
  isBookmarked: z.boolean().optional(),
  inLibrary: z.boolean().optional(),
});
export type QuestionInput = z.input<typeof questionInput>;

export const questionListQuery = z.object({
  q: text(200).optional(),
  subjectId: id.optional(),
  topicId: id.optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  color: z.enum([...COLOR_MARKS, "NONE"]).optional(),
  source: z.enum(QUESTION_SOURCES).optional(),
  favorite: z.stringbool().optional(),
  bookmarked: z.stringbool().optional(),
  incorrect: z.stringbool().optional(),
  tag: text(40).optional(),
  sort: z.enum(["newest", "oldest", "difficulty", "title"]).default("newest"),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const markInput = z.object({ colorMark: z.enum(COLOR_MARKS).nullable() });

// ── AI quiz generation and answering ───────────────────────────────────────
export const generateQuizInput = z.object({
  mode: z.enum(["SHORT", "LONG"]),
  subjectId: id,
  topicIds: z.array(id).max(30).default([]),
  customTopics: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  language: z.enum(LANGUAGE_IDS).nullish(),
  difficulty: z.enum([...DIFFICULTIES, "MIXED"]),
  count: z.number().int().min(1).max(25),
  types: z.array(z.enum(QUESTION_TYPES)).min(1, "Choose at least one question type."),
  provider: z.enum(AI_PROVIDERS).optional(),
  instructions: optionalText(1000),
});
export type GenerateQuizInput = z.input<typeof generateQuizInput>;

export const practiceFromLibraryInput = z.object({
  source: z.enum(["incorrect", "revision", "questions"]),
  questionIds: z.array(id).max(50).optional(),
  subjectId: id.optional(),
  limit: z.number().int().min(1).max(50).default(15),
});

export const answerInput = z.object({
  questionId: id,
  answerText: z.string().max(50_000).optional(),
  selectedOptionIds: z.array(z.string().max(8)).max(8).default([]),
  timeSpentSecs: z.number().int().min(0).max(86_400).optional(),
});

/** When no AI provider is available, the learner grades a subjective answer themselves. */
export const selfGradeInput = z.object({ verdict: z.enum(["CORRECT", "PARTIAL", "INCORRECT"]) });

// ── Revision ──────────────────────────────────────────────────────────────
export const revisionOverride = z.object({ nextReviewAt: isoDate });

// ── Practice papers ───────────────────────────────────────────────────────
export const paperSectionSpec = z.object({
  title: title(80),
  types: z.array(z.enum(QUESTION_TYPES)).min(1),
  questionCount: z.number().int().min(1).max(30),
  marksPerQuestion: z.number().int().min(1).max(50),
});
export const generatePaperInput = z.object({
  subjectId: id,
  title: title(160).optional(),
  topicIds: z.array(id).max(40).default([]),
  language: z.enum(LANGUAGE_IDS).nullish(),
  difficulty: z.enum([...DIFFICULTIES, "MIXED"]),
  durationMins: z.number().int().min(10).max(360),
  sections: z.array(paperSectionSpec).min(1).max(6),
  documentIds: z.array(id).max(10).default([]),
  instructions: optionalText(2000),
  provider: z.enum(AI_PROVIDERS).optional(),
});
export type GeneratePaperInput = z.input<typeof generatePaperInput>;

export const startPaperAttempt = z.object({
  mode: z.enum(["EXAM", "GUIDED"]),
  feedbackTiming: z.enum(["IMMEDIATE", "END"]).default("END"),
});
export const paperDraftInput = z.object({
  answers: z.record(z.string(), z.object({ text: z.string().max(50_000).optional(), options: z.array(z.string()).max(8).optional() })),
  flagged: z.array(z.string()).max(200).default([]),
});

export const uploadMeta = z.object({ kind: z.enum(DOCUMENT_KINDS), subjectId: optionalId });

// ── Planner ───────────────────────────────────────────────────────────────
export const goalInput = z.object({
  title: title(),
  description: optionalText(2000),
  subjectId: optionalId,
  topicId: optionalId,
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  targetDate: dateOnly.nullish(),
  estimatedMins: z.number().int().min(0).max(100_000).nullish(),
  milestones: z.array(title(160)).max(50).default([]),
});
export const goalPatch = goalInput.omit({ milestones: true }).partial().extend({ status: z.enum(GOAL_STATUSES).optional() });
export const milestoneInput = z.object({ title: title(160) });
export const milestonePatch = z.object({ title: title(160).optional(), done: z.boolean().optional() });

export const RECURRENCES = ["NONE", "DAILY", "WEEKDAYS", "WEEKLY"] as const;
export const sessionInput = z
  .object({
    title: title(),
    notes: optionalText(2000),
    subjectId: optionalId,
    topicId: optionalId,
    goalId: optionalId,
    milestoneId: optionalId,
    startsAt: isoDate,
    plannedMins: z.number().int().min(5).max(720),
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    recurrence: z.enum(RECURRENCES).default("NONE"),
    repeatUntil: dateOnly.nullish(),
  })
  .refine((s) => s.recurrence === "NONE" || !!s.repeatUntil, { path: ["repeatUntil"], message: "Choose when the repeat ends." });
export const sessionPatch = z.object({
  title: title().optional(),
  notes: optionalText(2000),
  subjectId: optionalId,
  topicId: optionalId,
  goalId: optionalId,
  milestoneId: optionalId,
  startsAt: isoDate.optional(),
  plannedMins: z.number().int().min(5).max(720).optional(),
  priority: z.enum(PRIORITIES).optional(),
});
export const sessionComplete = z.object({ actualMins: z.number().int().min(0).max(1440).optional() });
export const sessionReschedule = z.object({ startsAt: isoDate });

export const focusInput = z.object({
  startedAt: isoDate,
  endedAt: isoDate,
  label: optionalText(120),
  subjectId: optionalId,
  sessionId: optionalId,
});

// ── Calendar ──────────────────────────────────────────────────────────────
export const eventInput = z
  .object({
    category: z.enum(EVENT_CATEGORIES),
    title: title(),
    description: optionalText(5000),
    location: optionalText(200),
    subjectId: optionalId,
    goalId: optionalId,
    startsAt: isoDate,
    endsAt: isoDate.nullish(),
    allDay: z.boolean().default(false),
    reminderMins: z.array(z.number().int().min(0).max(20_160)).max(5).default([]),
    // Examination
    venue: optionalText(200),
    syllabus: optionalText(10_000),
    preparationStatus: z.enum(PREPARATION_STATUSES).optional(),
    // Assignment
    assignedAt: isoDate.nullish(),
    submissionStatus: z.enum(SUBMISSION_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((e) => !e.endsAt || new Date(e.endsAt) >= new Date(e.startsAt), {
    path: ["endsAt"],
    message: "The end must be after the start.",
  });
export const eventPatch = z.object({
  title: title().optional(),
  description: optionalText(5000),
  location: optionalText(200),
  subjectId: optionalId,
  startsAt: isoDate.optional(),
  endsAt: isoDate.nullish(),
  allDay: z.boolean().optional(),
  completed: z.boolean().optional(),
  reminderMins: z.array(z.number().int().min(0).max(20_160)).max(5).optional(),
  venue: optionalText(200),
  syllabus: optionalText(10_000),
  preparationStatus: z.enum(PREPARATION_STATUSES).optional(),
  assignedAt: isoDate.nullish(),
  submissionStatus: z.enum(SUBMISSION_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
});
export type EventInput = z.input<typeof eventInput>;
export const calendarRange = z.object({ from: isoDate, to: isoDate });

// ── Settings ──────────────────────────────────────────────────────────────
export const profilePatch = z.object({ name: nameSchema.optional(), avatarUrl: z.url().nullish() });
export const preferencesPatch = z.object({
  timeZone: timeZoneSchema.optional(),
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  preferredLanguages: z.array(z.enum(LANGUAGE_IDS)).max(20).optional(),
  defaultLanguage: z.enum(LANGUAGE_IDS).nullish(),
  defaultDifficulty: z.enum(DIFFICULTIES).nullish(),
  defaultSubjectIds: z.array(id).max(20).optional(),
  learningGoalsText: optionalText(1000),
  dailyStudyMinutes: z.number().int().min(0).max(1440).optional(),
  aiProvider: z.enum(AI_PROVIDERS).optional(),
  revisionDay: z.number().int().min(0).max(6).optional(),
  revisionSessionSize: z.number().int().min(5).max(50).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  defaultReminderMins: z.number().int().min(0).max(10_080).optional(),
  notifyInApp: z.boolean().optional(),
  notifyRevision: z.boolean().optional(),
  notifySessions: z.boolean().optional(),
  notifyAssignments: z.boolean().optional(),
  notifyExams: z.boolean().optional(),
  notifyEvents: z.boolean().optional(),
});
export const changePasswordInput = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const aiCredentialInput = z.object({
  apiKey: z.string().trim().min(10, "That doesn't look like an API key.").max(400),
  model: optionalText(100),
});
export const deleteAccountInput = z.object({ password: z.string().min(1).max(128), confirm: z.literal("DELETE") });
