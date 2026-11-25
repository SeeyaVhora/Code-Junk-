# Code Junk

> Your code. Your knowledge. Your journey.

A personal coding journal, AI practice platform and academic planner. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for decisions, schema and roadmap.

## What's inside

| Module | What you can do |
|---|---|
| Home | Today's sessions, deadlines with countdowns, revision reminder, continue learning, stats, last-7-days chart, quick actions |
| Code Booklet | Subjects, topics (add, rename, reorder), collections, CodeMirror editor, tags, favourites, booklet reading with previous/next, ZIP and PDF export |
| AI Practice | Short and Long mode generation (OpenAI or Gemini), one-question-at-a-time player, deterministic + rubric grading, green/yellow/red marking, saving, results, history |
| Smart Revision | Wrong answers and red/yellow marks enter a spaced-repetition queue; weekly revision day; date overrides |
| Question Library | Search, filters, colour views, incorrect questions, manual questions, coding-platform links, import from documents |
| Practice Papers | Syllabus/sample-paper uploads, sectioned paper generation, timed exam mode, guided mode, marking, PDF question paper / answer key / solved paper |
| Planner | Goals with milestones, recurring sessions with start/pause/complete timer, daily and weekly plans, focus timer |
| Calendar | Month, week, day and agenda views; exams, assignments, college and personal events; drag to reschedule; reminders |
| Analytics | Accuracy, study time, subject and topic performance, coding, revision, insights from real data |
| Settings | Profile, password, account deletion, AI keys (encrypted), learning and notification preferences, theme, data export |

## Layout

```
apps/web         React + Vite + Tailwind v4 frontend
apps/api         Express 5 API, Prisma 7 + PostgreSQL
packages/shared  Zod schemas and enums shared by web and api
docs/            Architecture and decisions
```

## Getting started

```bash
npm install                    # also generates the Prisma client
cp .env.example .env           # then fill in SESSION_SECRET and CREDENTIALS_ENCRYPTION_KEY
docker compose up -d postgres  # Postgres on localhost:5433
npm run prisma:deploy -w @code-junk/api

npm run dev -w @code-junk/api  # API on http://localhost:4100
npm run dev:web                # Web on http://localhost:5173 (proxies /api to the API)
```

If port 5173 is already taken on your machine, run `npx vite --port 5180` in `apps/web`, and start the API with `WEB_ORIGIN=http://localhost:5180` so its CSRF origin check accepts that address.

AI features need an OpenAI or Gemini key: either set `OPENAI_API_KEY` / `GEMINI_API_KEY` in `.env` for everyone, or add your own key in **Settings → AI providers** (stored encrypted). Without a key, everything else works and subjective answers can be self-graded.

## Tests

```bash
npm test -w @code-junk/api     # 45 integration + unit tests against a separate test database
npm run typecheck              # all workspaces
npm run build:web
```
