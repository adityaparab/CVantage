# CVantage

**AI-powered resume analysis for job seekers.** Build or upload a resume, run it against any job description, and get scored insights — ATS compatibility, strengths and gaps, field-level improvement suggestions, and tailored interview questions — then apply suggestions and export to PDF/DOCX.

> 🚧 **Under active development.** The implementation plan lives in [`PLAN.md`](./PLAN.md); work is tracked in [GitHub issues](https://github.com/adityaparab/CVantage/issues) (12 phase epics, one issue at a time).

## Stack

NestJS · MongoDB/Mongoose · LangChain (langchain-openai) · zod · React + TypeScript + Vite · Tailwind · TanStack Query — a Yarn 1.x workspaces monorepo (`server/`, `frontend/`, `shared/`).

## Prerequisites

- Node.js ≥ 22 (`.nvmrc`)
- Yarn classic 1.22.x — `npm i -g yarn` (no corepack)
- Docker (for local MongoDB and the full-container mode)

## Quickstart

```bash
yarn install
```

Local development setup (Mongo via Docker Compose, dev servers, environment variables) is delivered incrementally by the Phase 0–1 issues — this section is completed as they land:

- [ ] `docker compose --profile db up -d` — local MongoDB (issue #8)
- [ ] `yarn dev:server` / `yarn dev:frontend` — dev servers (issues #10, #58)
- [ ] `.env` configuration — see `.env.example` (issue #11)

## Repository layout

```
server/    NestJS API (serves the built frontend in production)
frontend/  React + Vite client
shared/    Shared zod schemas, DTOs, enums
scripts/   Project tooling (GitHub issue bootstrap)
database/  Canonical Mongoose schema reference
```

## Documents

- [`PLAN.md`](./PLAN.md) — full implementation plan (phases, architecture, decisions)
- [`PROMPT.md`](./PROMPT.md) — product requirements
- [`cvantage-mockup.html`](./cvantage-mockup.html) — UI reference
