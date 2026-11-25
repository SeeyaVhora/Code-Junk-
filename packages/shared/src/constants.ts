/** Enums mirrored from the Prisma schema, plus display metadata shared by web and api. */

export const COLOR_MARKS = ["GREEN", "YELLOW", "RED"] as const;
export type ColorMark = (typeof COLOR_MARKS)[number];

export const DIFFICULTIES = ["BEGINNER", "EASY", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  BEGINNER: "Beginner",
  EASY: "Easy",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  EXPERT: "Expert",
};

export const QUESTION_TYPES = [
  "THEORY",
  "CONCEPTUAL",
  "SHORT_ANSWER",
  "MCQ",
  "OUTPUT_PREDICTION",
  "DEBUGGING",
  "SHORT_CODE",
  "LONG_CODE",
  "PSEUDOCODE",
  "PROBLEM_SOLVING",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  THEORY: "Theory",
  CONCEPTUAL: "Conceptual",
  SHORT_ANSWER: "Short answer",
  MCQ: "MCQ",
  OUTPUT_PREDICTION: "Output prediction",
  DEBUGGING: "Debugging",
  SHORT_CODE: "Short code",
  LONG_CODE: "Long code",
  PSEUDOCODE: "Pseudocode",
  PROBLEM_SOLVING: "Problem solving",
};
/** Types whose answer is code, so the answer box is a code editor. */
export const CODE_ANSWER_TYPES: QuestionType[] = ["DEBUGGING", "SHORT_CODE", "LONG_CODE", "PSEUDOCODE", "PROBLEM_SOLVING"];
export const SHORT_MODE_TYPES: QuestionType[] = ["THEORY", "CONCEPTUAL", "MCQ", "OUTPUT_PREDICTION", "SHORT_CODE"];
export const LONG_MODE_TYPES: QuestionType[] = ["THEORY", "LONG_CODE", "PROBLEM_SOLVING", "PSEUDOCODE", "DEBUGGING", "CONCEPTUAL"];

export const QUESTION_SOURCES = ["AI_GENERATED", "MANUAL", "SAMPLE_PAPER", "EXTERNAL_PLATFORM", "IMPORTED_DOCUMENT"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];
export const QUESTION_SOURCE_LABEL: Record<QuestionSource, string> = {
  AI_GENERATED: "AI generated",
  MANUAL: "Written by me",
  SAMPLE_PAPER: "Sample paper",
  EXTERNAL_PLATFORM: "Coding platform",
  IMPORTED_DOCUMENT: "Imported document",
};

export const VERDICTS = ["CORRECT", "PARTIAL", "INCORRECT", "UNGRADED"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ABANDONED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "PAUSED", "COMPLETED", "SKIPPED", "RESCHEDULED", "CANCELLED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const EVENT_CATEGORIES = ["EXAMINATION", "ASSIGNMENT", "COLLEGE_EVENT", "LEARNING_DEADLINE", "PERSONAL"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABEL: Record<EventCategory | "LEARNING_SESSION", string> = {
  EXAMINATION: "Examination",
  ASSIGNMENT: "Assignment",
  COLLEGE_EVENT: "College event",
  LEARNING_DEADLINE: "Learning deadline",
  PERSONAL: "Personal",
  LEARNING_SESSION: "Learning session",
};

export const PREPARATION_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "READY"] as const;
export type PreparationStatus = (typeof PREPARATION_STATUSES)[number];

export const SUBMISSION_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SUBMITTED", "GRADED", "LATE"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const AI_PROVIDERS = ["OPENAI", "GEMINI"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const DOCUMENT_KINDS = ["SYLLABUS", "SAMPLE_PAPER", "PREVIOUS_YEAR_PAPER", "REFERENCE", "ASSIGNMENT_ATTACHMENT", "CODE_FILE", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Languages offered for snippets and questions. `ext` is used for downloads. */
export const LANGUAGES = [
  { id: "go", label: "Go", ext: "go" },
  { id: "python", label: "Python", ext: "py" },
  { id: "java", label: "Java", ext: "java" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "c", label: "C", ext: "c" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "csharp", label: "C#", ext: "cs" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "kotlin", label: "Kotlin", ext: "kt" },
  { id: "php", label: "PHP", ext: "php" },
  { id: "ruby", label: "Ruby", ext: "rb" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "bash", label: "Bash", ext: "sh" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "plaintext", label: "Plain text", ext: "txt" },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]["id"];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];
export const languageLabel = (id: string | null | undefined) => LANGUAGES.find((l) => l.id === id)?.label ?? id ?? "";
export const languageExt = (id: string | null | undefined) => LANGUAGES.find((l) => l.id === id)?.ext ?? "txt";
