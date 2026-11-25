# Code Junk

> Your code. Your knowledge. Your journey.

A personal coding journal, AI practice platform and academic planner. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for decisions, schema and roadmap.

## Layout

```
apps/web         React + Vite + Tailwind v4 frontend
apps/api         Express API (Phase 2b+); Prisma schema in apps/api/prisma
packages/shared  Zod schemas and enums shared by web and api
docs/            Architecture and decisions
```

## Getting started

```bash
npm install
cp .env.example .env          # fill in secrets; never commit .env
npm run dev:web               # http://localhost:5173 (use `npx vite --port 5180` in apps/web if 5173 is taken)
npm run db:up                 # Postgres in Docker (needed from Phase 2b)
```

In development, `/design-system` shows all tokens and components.

## Status

- [x] Phase 1: architecture, database schema, monorepo scaffold
- [x] Phase 2a: design system, landing page
- [ ] Phase 2b: auth API and auth pages
- [ ] Phase 3+: see the roadmap in `docs/ARCHITECTURE.md`
