# Code Junk — Architecture & Roadmap

> "Your code. Your knowledge. Your journey."

This document records the architectural decisions for Code Junk. Update it whenever a significant decision changes.

---

## 1. Repository analysis (Phase 1 starting point)

| Item | Finding |
|---|---|
| Existing code | None. Empty directory, greenfield. |
| Git | Not initialised → initialised on `main` as part of Phase 1. |
| Toolchain | Node 24, npm 11, Docker 29. No local PostgreSQL → run Postgres via Docker Compose. |
| Conventions | None yet. Established below. |

---

## 2. Technical decisions

| Concern | Decision | Why |
|---|---|---|
| Repo layout | **npm workspaces monorepo**: `apps/web`, `apps/api`, `packages/shared` | One install, shared Zod schemas/types between client and server, no extra tooling (Turborepo/Nx unnecessary at this size). |
| Frontend | **React 19 + TypeScript + Vite + React Router** (SPA) | Backend is a separate Express API, so Next.js's server features would duplicate it. Vite gives the fastest dev loop. |
| Styling | **Tailwind CSS v4** with CSS-variable design tokens (`@theme`) | Tokens live in one file; light/dark themes switch by swapping variables, not class soup. |
| Components | **Own component library** in `apps/web/src/components/ui` (built on Radix primitives where accessibility is hard: dialog, dropdown, popover, tabs) | Avoids the generic "shadcn dashboard" look while keeping a11y correct. |
| Icons | Lucide | Requested; consistent stroke style. |
| Code editor | **CodeMirror 6** | ~10× smaller than Monaco, mobile-friendly, modular language packs. Monaco is overkill for snippets. |
| Server state | **TanStack Query** | Caching, loading/error states, optimistic updates (marking questions, completing tasks). |
| Forms | React Hook Form + Zod resolver | Same Zod schemas validate on client and server. |
| Charts | Recharts | Declarative, enough for weekly/monthly charts. |
| Calendar | **FullCalendar** (month/week/day/list views, drag & drop) | Building four calendar views with DnD and time zones by hand is a large, error-prone job. |
| Backend | **Node + Express 5 + TypeScript** | Requested. Express 5 handles async errors natively. |
| Database | **PostgreSQL 16 + Prisma 7 (stable)** | Relational data with many joins; Prisma gives typed queries. Pin 7.x — 8.x is still RC. |
| Auth | **Server-side sessions in Postgres**, `httpOnly; Secure; SameSite=Lax` cookie, **Argon2id** password hashing | Revocable sessions (sign-out-everywhere, account deletion) with no JWTs in localStorage, so XSS cannot steal tokens. CSRF: SameSite plus a double-submit token header on mutating requests. |
| Validation | Zod 4 everywhere: request bodies, query params, env vars, **AI outputs** | One schema language. |
| AI | Provider abstraction (`AiProvider` interface) with **OpenAI** and **Gemini** adapters using native structured-output / JSON-schema modes | Switch providers per user without touching feature code. |
| User API keys | Optional bring-your-own-key, **encrypted at rest (AES-256-GCM)**, never returned to the client (only last 4 chars) | Spec requires "AI API configuration" in settings. Falls back to the server key. |
| File storage | `StorageAdapter` interface: **local disk in dev**, S3-compatible (R2/S3/MinIO) in prod | No cloud dependency for local development. |
| Document extraction | `pdf-parse` (PDF), `mammoth` (DOCX), plain text | Syllabus and sample-paper ingestion. |
| PDF export | **Server-side `@react-pdf/renderer`** | Deterministic layout for papers/answer keys; no headless browser in prod. |
| Background jobs | **pg-boss** (Postgres-backed queue) | Reminders, weekly revision generation, long AI jobs. No Redis needed. |
| Code execution | **Deferred**, behind a `CodeRunner` interface (Judge0 or a gVisor/Firecracker sandbox) | Never run user code on the API host. Until then coding answers use AI rubric evaluation, labelled as such. |
| Logging | pino + request IDs; redact `authorization`, `cookie`, API keys, prompts' user content | Spec: logging without leaking sensitive data. |
| Rate limiting | `express-rate-limit` (Postgres store): strict on `/api/auth/*` and `/api/ai/*` | Brute force and AI cost protection. |
| Testing | Vitest (unit), Supertest (API), Playwright (E2E critical flows) | |

### Time zones
All timestamps are stored as UTC `timestamptz`. The user's IANA time zone lives in `UserPreferences.timeZone`. "Today", streaks, the Sunday revision and reminders are computed in the user's zone (via `date-fns-tz`). All-day events store a plain `date`.

---

## 3. System overview

```
┌──────────────────────────┐        HTTPS (cookie session + CSRF header)
│  apps/web (React SPA)    │ ───────────────────────────────────────────┐
│  TanStack Query, Router  │                                            ▼
└──────────────────────────┘                          ┌────────────────────────────────┐
                                                      │ apps/api (Express)             │
                                                      │  middleware: helmet, cors,     │
                                                      │  session, csrf, rateLimit, zod │
                                                      │  modules/* (routes→service→db) │
                                                      │  ai/ (provider abstraction)    │
                                                      │  jobs/ (pg-boss workers)       │
                                                      └──────┬──────────┬──────────┬───┘
                                                             │          │          │
                                                       PostgreSQL   Storage     OpenAI /
                                                       (Prisma)     (disk/S3)   Gemini
```

**Layering inside the API:** `routes` (HTTP + Zod parsing) → `service` (business rules, ownership checks) → `prisma`. Every service function takes `userId` as its first argument, and every query filters by it. When a request references another row (e.g. a snippet's `subjectId`), the service first checks that row belongs to the same user (`assertOwned(userId, model, id)`), and API tests cover cross-user access for every module. Postgres Row-Level Security is a possible later hardening step.

---

## 4. How the modules connect (domain events)

The spec stresses that features must affect each other. A small in-process event bus (`events.emit('answer.graded', …)`) keeps modules decoupled:

| Event | Consumers |
|---|---|
| `answer.graded` (incorrect/partial) | Revision: upsert `RevisionItem`, schedule next review. Analytics: update topic stats. |
| `answer.graded` (correct, during revision) | Revision: advance spaced-repetition interval (never deletes the item). |
| `question.marked` (RED/YELLOW) | Revision: enqueue for the weekly session. |
| `quiz.completed` | Analytics, dashboard "continue learning", streak. |
| `session.scheduled` | Calendar shows learning sessions (read-through query, not duplicated rows). |
| `session.completed` | Study-time totals, goal progress, streak. |
| `exam.created` / `assignment.created` | Dashboard deadlines, reminder jobs. |
| `question.saved` | Library. A question is one row; quizzes and papers *reference* it. |

**Single-source rule:** a `Question` row is the canonical item. Quizzes, papers, the library and revision all point to it, so marking a question RED anywhere shows everywhere.

---

## 5. Smart revision algorithm

- Every incorrect or partial answer creates or updates **one `RevisionItem` per (user, question)**, with full attempt history kept in `AnswerSubmission`.
- Scheduling uses a simplified **SM-2**: `ease` (default 2.5), `intervalDays`, `repetitions`, `lapses`. Quality comes from the grade (correct=5, partial=3, incorrect=1) adjusted by question difficulty and colour mark (RED caps the interval at 7 days).
- An item only becomes `MASTERED` after **3 consecutive correct revisions** with interval ≥ 21 days. It is never deleted.
- **Weekly revision** (user's `revisionDay`, default Sunday): a job at 00:05 local time builds a `RevisionSession` from due items + RED + YELLOW + previously hard questions, capped at the user's preferred size.
- The user can override `nextReviewAt` manually (`dueOverridden = true`).

---

## 6. AI engineering

```
ai/
  provider.ts          AiProvider interface: generateStructured<T>(schema, prompt, opts)
  providers/openai.ts  JSON-schema structured outputs
  providers/gemini.ts  responseSchema structured outputs
  prompts/             versioned templates: generateQuestions.v1, evaluateAnswer.v1, generatePaper.v1, analyseMaterial.v1
  schemas/             Zod schemas → JSON Schema (z.toJSONSchema)
  service.ts           retry (exp. backoff, 2 tries, re-ask on validation failure), timeout, token+cost accounting → AiRequestLog
```

- **Output validation:** every response is parsed with Zod. On failure, one repair retry sends the validation errors back. After that the job fails cleanly; nothing is saved.
- **Post-validation:** within-quiz dedupe (normalised text + embedding-free trigram similarity), topic membership check, MCQ answer key must be one of the options, `marks` must sum to the paper total.
- **Evaluation:** objective types (MCQ, true/false, exact output prediction) are graded **deterministically**. Subjective and coding answers use a fixed rubric prompt returning `{score, maxScore, verdict: CORRECT|PARTIAL|INCORRECT, criteriaResults[], feedback}`. The UI labels these "AI-assessed".
- **Cost awareness:** `AiRequestLog` stores provider, model, tokens in/out and estimated cost. Per-user daily token budget plus rate limit.
- **Practice papers** are always labelled "Original practice paper generated from your materials", never presented as real exam papers.

---

## 7. Folder structure

```
code-junk/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/                 router, providers, layouts (PublicLayout, AppShell)
│  │  │  ├─ components/
│  │  │  │  ├─ ui/               Button, Card, Input, Badge, Dialog, Tabs, Skeleton, EmptyState…
│  │  │  │  ├─ brand/            Logo
│  │  │  │  └─ code/             CodeEditor, CodeBlock
│  │  │  ├─ features/            one folder per module, each with api.ts, hooks.ts, components/, pages/
│  │  │  │  ├─ landing/  auth/  dashboard/  booklet/  practice/  quiz/  library/
│  │  │  │  ├─ papers/  planner/  calendar/  analytics/  revision/  settings/
│  │  │  ├─ lib/                 apiClient, cn(), date utils
│  │  │  └─ styles/              tokens.css, globals.css
│  │  └─ index.html
│  └─ api/
│     ├─ prisma/schema.prisma
│     └─ src/
│        ├─ config/              env (Zod-validated)
│        ├─ middleware/          auth, csrf, error, rateLimit, validate
│        ├─ modules/<name>/      routes.ts, service.ts, schemas.ts
│        ├─ ai/                  see §6
│        ├─ jobs/                reminders, weeklyRevision, aiGeneration
│        ├─ storage/             disk.ts, s3.ts
│        ├─ events/              bus.ts
│        └─ server.ts
├─ packages/shared/              Zod schemas + enums shared by web and api
├─ docs/ARCHITECTURE.md
├─ docker-compose.yml            postgres (+ minio later)
└─ .env.example
```

---

## 8. Database design

The full schema is in [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Key choices:

- **Ownership:** every user-owned table has `userId` with an index and `onDelete: Cascade` from `User`. Account deletion removes everything.
- **Subjects → Topics (self-referencing for subtopics)** are shared by snippets, questions, goals, sessions, events and papers. One taxonomy for the whole app.
- **Tags** are per-user, joined via `SnippetTag` / `QuestionTag`.
- **History is append-only:** `QuizAttempt`, `AnswerSubmission`, `PaperAttempt`, `RevisionReview` are never overwritten.
- **Calendar:** `CalendarEvent` is the base row (title, start/end, category, reminders). `Examination` and `Assignment` are 1:1 extensions holding type-specific fields. Learning sessions appear on the calendar through a union query, not duplicated rows.
- **Question marking** (`GREEN|YELLOW|RED`) lives on `Question`, since it belongs to the user's question. Per-attempt suggested marks live on `AnswerSubmission`.

Entity map (spec's 25 entities → schema):

| Spec | Schema model |
|---|---|
| Users, UserPreferences | `User`, `UserPreferences`, `Session`, `PasswordResetToken`, `AiCredential` |
| Subjects, Topics | `Subject`, `Topic` (parentId for subtopics) |
| CodeSnippets, CodeCollections, Tags | `CodeSnippet`, `CodeCollection`, `Tag`, `SnippetTag` |
| Questions, QuestionTags | `Question`, `QuestionTag`, `QuestionCollection` |
| Quizzes, QuizQuestions, QuizAttempts, AnswerSubmissions | `Quiz`, `QuizQuestion`, `QuizAttempt`, `AnswerSubmission` |
| QuestionReviews, RevisionSchedules | `RevisionItem` (schedule state), `RevisionReview` (history), `RevisionSession` |
| PracticePapers, PaperQuestions, PaperAttempts | `PracticePaper`, `PaperSection`, `PaperQuestion`, `PaperAttempt` (+ answers via `AnswerSubmission`) |
| LearningGoals, LearningSessions | `LearningGoal`, `LearningSession` |
| CalendarEvents, Assignments, Examinations | `CalendarEvent`, `Assignment`, `Examination` |
| Notifications | `Notification`, `Reminder` |
| UploadedDocuments | `UploadedDocument` |
| (extra) | `AiRequestLog`, `ActivityLog` (powers streaks, "recently opened") |

---

## 9. API surface

REST under `/api`, JSON, Zod-validated. Lists are cursor-paginated (`?cursor=&limit=`) with `q`, filter and `sort` params.

`/auth` (signup, signin, signout, forgot, reset, me) · `/users` (profile, preferences, avatar, ai-credentials, export, delete) · `/subjects` · `/topics` · `/snippets` (+ `/export`) · `/tags` · `/questions` · `/library` (collections, incorrect) · `/ai` (generate-quiz, evaluate) · `/quizzes` · `/attempts` · `/revisions` (due, sessions, override) · `/practice-papers` (+ generate, attempts, pdf) · `/learning-goals` · `/learning-sessions` · `/calendar` (unified feed) · `/assignments` · `/examinations` · `/notifications` · `/analytics` (overview, subjects, topics, weaknesses) · `/uploads`

Status codes: 200/201/204, 400 (validation), 401, 403 (never leak existence: other users' resources return **404**), 409, 422 (AI output invalid), 429, 500. Errors use `{ error: { code, message, details? } }`.

---

## 10. Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **1** Planning | This doc, Prisma schema, monorepo scaffold, git | Schema validates. Plan reviewed. |
| **2** Foundation | Design tokens, UI kit, landing page, auth pages (UI) + **auth API**, Docker Postgres | User can sign up/in/out, reset password; landing responsive. |
| **3** App shell | AppShell, hamburger nav (nested, mobile), dashboard skeleton wired to real endpoints, profile & preferences | Dashboard shows real (empty-state) data. |
| **4** Core modules | Subjects/topics/tags, Code Booklet (editor, booklet view, search, export files), Question Library CRUD + filters | Full CRUD with persistence and tests. |
| **5** AI | Provider layer, Short/Long generation, quiz player, grading, marking, saving | End-to-end quiz with validated AI output. |
| **6** Revision & papers | Revision items + SM-2, weekly job, uploads + extraction, paper generation, exam/guided modes, PDF export | Wrong answer → appears in Sunday session. |
| **7** Academic | Goals, sessions (recurrence), FullCalendar, exams/assignments/events, reminders | Session scheduled → on calendar + dashboard. |
| **8** Analytics | Aggregations, charts, weakness analysis with minimum-sample thresholds | No metric shown without enough data. |
| **9** Hardening | Playwright E2E, a11y audit, perf, security review | Critical flows green in CI. |

---

## 11. Risks & challenges

1. **AI output quality and validity.** Wrong answer keys or unsolvable problems. Mitigation: strict schemas, MCQ key checks, "report a problem" on each question, user can edit any stored solution.
2. **Grading subjective answers fairly.** Mitigation: fixed rubric, temperature 0, explicit PARTIAL verdict, "AI-assessed" label, user can dispute or override the grade.
3. **Code execution safety.** No execution until a real sandbox exists (§2).
4. **AI cost.** Per-user budgets, rate limits, caching material analysis per uploaded document.
5. **Time zones and recurrence.** Use RRULE strings (`rrule` lib) and compute in the user's zone. Test DST transitions.
6. **Scope.** 9 modules is a lot. Each phase ships working vertical slices rather than half-built screens everywhere.
7. **Misleading analytics.** Minimum sample sizes (e.g. ≥5 attempts before a topic is labelled "weak"). Explicit "not enough data yet" states.
8. **Copyright.** External platform questions store URL + attribution + the user's own notes. No scraping. Practice papers are clearly marked as original.
