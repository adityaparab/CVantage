# CVantage — GitHub issues source (parsed by create-issues.mjs)
# Format: @@LABELS / @@MILESTONES blocks, then @@ISSUE blocks (meta lines, ---, body, @@END).
# {{key}} tokens in bodies are replaced with real issue numbers after creation.
# Epics must appear before their child tasks. Derived from the approved PLAN.md.

@@LABELS
type:epic | 6F42C1 | Phase-level epic that groups task sub-issues
type:task | 1D76DB | Independently implementable unit of work
area:server | 0E8A16 | NestJS backend
area:client | FBCA04 | React frontend
area:shared | C2E0C6 | Shared zod schemas / DTO package
area:infra | 5319E7 | Tooling, CI/CD, Docker, deployment
area:docs | 006B75 | Documentation
phase:0 | BFD4F2 | Repository & Tooling Bootstrap
phase:1 | BFD4F2 | Backend Foundation
phase:2 | BFD4F2 | AuthN/AuthZ & Users
phase:3 | BFD4F2 | Resume Domain
phase:4 | BFD4F2 | AI Platform & Analysis Pipeline
phase:5 | BFD4F2 | Notifications & Realtime
phase:6 | BFD4F2 | Admin Domain
phase:7 | BFD4F2 | Frontend Foundation
phase:8 | BFD4F2 | Frontend Candidate Experience
phase:9 | BFD4F2 | Frontend Admin + Resume Export
phase:10 | BFD4F2 | Integration, Quality & Hardening
phase:11 | BFD4F2 | Docker, CI/CD & Railway
priority:P0 | B60205 | Blocking — phase cannot close without it
priority:P1 | D93F0B | Required for production readiness
priority:P2 | FEF2C0 | Polish / nice-to-have within scope
@@END

@@MILESTONES
M0 | Phase 0 — Repository & Tooling Bootstrap | Monorepo skeleton, quality gates, CI skeleton, GitHub hygiene
M1 | Phase 1 — Backend Foundation | Runnable NestJS core: config, Mongo, logging, errors, health, security, Swagger, tests, seeds
M2 | Phase 2 — AuthN/AuthZ & Users | Local auth, JWT+refresh rotation, RBAC, flagged OAuth, verification/reset, me-endpoints
M3 | Phase 3 — Resume Domain | Resume CRUD, dashboard stats, upload, storage abstraction, text extraction
M4 | Phase 4 — AI Platform & Analysis Pipeline | Model registry, LlmService, job runner, parsing, 3-step analysis, suggestion apply
M5 | Phase 5 — Notifications & Realtime | Bell notifications + SSE streams with polling fallback
M6 | Phase 6 — Admin Domain | Admin stats, user management, privacy-bounded resume admin, AI model settings
M7 | Phase 7 — Frontend Foundation | Vite scaffold, design system, theming, routing, API client, forms, test harness
M8 | Phase 8 — Frontend Candidate Experience | Landing, auth, dashboard, upload, editor, analysis screens, apply-suggestions
M9 | Phase 9 — Frontend Admin + Resume Export | Admin UI + PDF/DOCX export wired to download dropdown
M10 | Phase 10 — Integration, Quality & Hardening | SPA serving, a11y/perf passes, Sentry, OTel, Playwright, security review, docs
M11 | Phase 11 — Docker, CI/CD & Railway | Production image, compose profiles, full pipeline, Railway deploy, launch checklist
@@END

@@ISSUE
key: E0
title: [EPIC] Phase 0 — Repository & Tooling Bootstrap
labels: type:epic, phase:0, area:infra
milestone: M0
---
## Phase goal
Stand up the monorepo skeleton with non-negotiable quality gates before any feature code exists: Yarn 1.x workspaces, shared lint/format toolchain, pre-commit hooks, commit-message validation, CI skeleton, GitHub hygiene, and a local Mongo via Docker Compose.

## Exit criteria (phase gate)
- [ ] `yarn install --frozen-lockfile` + `yarn lint` + `yarn test` green at repo root
- [ ] Hooks block bad commits (lint error, failing related test, malformed message)
- [ ] CI green on PRs and `main`
- [ ] Labels, milestones, issue/PR templates exist on the repo
- [ ] `docker compose --profile db up -d` provides a healthy local Mongo

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P0), §10 E0.
@@END

@@ISSUE
key: 0.1
title: 0.1 — Initialize monorepo (Yarn 1.x workspaces) & first push
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
Empty repo → working monorepo skeleton. Everything else builds on this layout. Yarn classic (latest 1.x) is the mandated package manager — **no corepack**.

## Scope
- Git repo on `main`, remote `https://github.com/adityaparab/CVantage`
- Root `package.json`: `private: true`, `workspaces: ["server", "frontend", "shared"]`, `engines: { node: ">=22", yarn: "^1.22.0" }`, root convenience scripts (`lint`, `test`, `build`, `dev:*` delegating to workspaces)
- `.npmrc` with `engine-strict=true`; `.nvmrc` (22); `.editorconfig`; `.gitignore` (node_modules, dist, coverage, `.env*` except `.env.example`, `.secrets/`, uploads dir)
- Placeholder `package.json` in `server/`, `frontend/`, `shared/` so the workspace graph resolves
- README stub (project name, one-paragraph description, placeholder setup section)
- Commit existing docs: `PROMPT.md`, `CLAUDE.md`, `PLAN.md`, `cvantage-mockup.html`, `database/`, `scripts/`

## Subtasks
- [ ] `git init -b main` + remote add + initial commit structure
- [ ] Root package.json with workspaces + engines + scripts
- [ ] `.gitignore` / `.editorconfig` / `.nvmrc` / `.npmrc` (engine-strict)
- [ ] Workspace placeholder packages
- [ ] README stub
- [ ] Push `main` to GitHub

## Acceptance criteria
- [ ] Fresh clone + `yarn install` succeeds with Yarn 1.22.x (no corepack involved); `yarn workspaces info` shows all three workspaces
- [ ] `npm install` in repo root is rejected by engine-strict (yarn enforced)
- [ ] `.env` files and `.secrets/` are ignored by git (verified with `git check-ignore`)
- [ ] All existing project documents are committed and visible on GitHub

## Technical notes
Yarn install paths: bundled on GitHub runners and `node` Docker images; locally `npm i -g yarn` (documented in README).
@@END

@@ISSUE
key: 0.2
title: 0.2 — Shared ESLint + Prettier toolchain (zero-warning policy)
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
One lint/format ruleset for the whole monorepo so server, frontend and shared code stay uniform from the first real commit.

## Scope
- ESLint flat config at root: typescript-eslint (type-aware on `src/**`), import ordering, unused-import removal; React/hooks/a11y plugins scoped to `frontend/**`
- Prettier at root (single config; `.prettierignore`)
- Per-workspace `lint`, `lint:fix`, `format` scripts + root aggregates
- Out of scope: CI wiring ({{0.6}})

## Subtasks
- [ ] Root `eslint.config.mjs` with per-workspace overrides
- [ ] Prettier config + ignore file
- [ ] Workspace + root scripts
- [ ] Fix any violations in placeholder code

## Acceptance criteria
- [ ] `yarn lint` runs clean at root with `--max-warnings 0` enforced
- [ ] `yarn lint:fix` and `yarn format` are idempotent (second run = no diff)
- [ ] A deliberately mis-formatted file fails `yarn lint` (demonstrated in PR description, then removed)
- [ ] React-specific rules do not fire on server code and vice versa

## Dependencies
Blocked by {{0.1}}.
@@END

@@ISSUE
key: 0.3
title: 0.3 — Husky pre-commit hook (lint + fix + related unit tests)
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
`CLAUDE.md` mandates pre-commit hooks that lint, lint-fix and unit-test both client and server. Broken code must not be committable.

## Scope
- husky installed at root, auto-installed via root `prepare` script on `yarn install`
- lint-staged: staged files → eslint --fix + prettier; staged `*.ts/tsx` → run related unit tests only (jest `--findRelatedTests` / vitest `related`) per affected workspace
- Fast path: skip test step when no source files staged

## Subtasks
- [ ] husky init + `pre-commit` hook
- [ ] lint-staged config per workspace globs
- [ ] Related-test runners wired for server (jest) and frontend (vitest) — activate as those harnesses land ({{1.10}}, {{7.6}})
- [ ] Document bypass policy (`--no-verify` discouraged; CI still gates)

## Acceptance criteria
- [ ] Commit containing a lint error is blocked; auto-fixable issues are fixed and re-staged
- [ ] Commit touching a source file with a failing related unit test is blocked
- [ ] Clean commit completes in < 60s
- [ ] Hooks work on a fresh clone after plain `yarn install` (no manual step)

## Dependencies
Blocked by {{0.1}}, {{0.2}}.
@@END

@@ISSUE
key: 0.4
title: 0.4 — Commit message validation (commitlint, conventional commits)
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
`CLAUDE.md` requires commit message validation. Conventional commits also feed readable history and future changelog automation.

## Scope
- commitlint with `@commitlint/config-conventional` on a husky `commit-msg` hook
- Allowed scopes: `server`, `frontend`, `shared`, `infra`, `docs`, `deps` (enforced)
- CONTRIBUTING.md section documenting format with examples

## Subtasks
- [ ] commitlint config + commit-msg hook
- [ ] Scope enum rule
- [ ] CONTRIBUTING.md commit-format section

## Acceptance criteria
- [ ] `feat(server): add health module (#12)` accepted
- [ ] `bad message`, `feat(unknown): x`, and `FEAT: x` rejected with a helpful error
- [ ] Convention documented in CONTRIBUTING.md

## Dependencies
Blocked by {{0.3}}.
@@END

@@ISSUE
key: 0.5
title: 0.5 — GitHub hygiene: issue/PR templates, CODEOWNERS
labels: type:task, phase:0, area:infra, priority:P1
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
Labels and milestones are created by the bootstrap script; the repo still needs templates so every future issue/PR keeps the agreed structure.

## Scope
- `.github/ISSUE_TEMPLATE/task.md` mirroring the body structure used in this catalog (Context / Scope / Subtasks / Acceptance criteria / Dependencies / Technical notes)
- `.github/pull_request_template.md`: summary, linked issue (`Closes #N`), checklist (tests added/green, lint clean, docs + `.env.example` updated, Swagger annotations for changed endpoints)
- `CODEOWNERS` → `@adityaparab`
- Branch protection recommendation for `main` documented in CONTRIBUTING.md (required checks list comes from {{11.3}})

## Acceptance criteria
- [ ] New issue/PR on GitHub renders the templates
- [ ] CODEOWNERS recognized by GitHub (file validates)
- [ ] CONTRIBUTING.md lists recommended branch-protection settings

## Dependencies
Blocked by {{0.1}}.
@@END

@@ISSUE
key: 0.6
title: 0.6 — CI skeleton (GitHub Actions: install, lint, typecheck, test, build)
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
Quality gates must exist before feature code. This is the skeleton that later phases extend ({{11.3}} completes the pipeline).

## Scope
- `.github/workflows/ci.yml` on PR + push to `main`
- actions/setup-node (Node 22, `cache: yarn`) — GitHub runners ship Yarn 1 preinstalled; **no corepack step**
- `yarn install --frozen-lockfile` → matrix over workspaces: lint → typecheck → test → build
- Concurrency group cancelling superseded runs

## Subtasks
- [ ] Workflow with workspace matrix
- [ ] Yarn cache via setup-node
- [ ] Status badges in README

## Acceptance criteria
- [ ] CI green on the placeholder workspaces
- [ ] Second run on unchanged lockfile hits the yarn cache (visible in logs)
- [ ] A PR with a failing lint/test shows a red check and blocks merge (verified once branch protection is on)
- [ ] Total skeleton runtime < 3 min

## Dependencies
Blocked by {{0.1}}, {{0.2}}.
@@END

@@ISSUE
key: 0.7
title: 0.7 — Local Mongo via Docker Compose (`db` profile)
labels: type:task, phase:0, area:infra, priority:P0
milestone: M0
parent: E0
---
Part of {{E0}}.

## Context
Local development (non-Docker mode) needs a one-command MongoDB. The full app container arrives in {{11.2}}; this issue only ships the `db` profile.

## Scope
- `docker-compose.yml` with `mongo:7` service under profile `db`: named volume, healthcheck (`mongosh --eval "db.adminCommand('ping')"`), port 27017
- README quickstart: `docker compose --profile db up -d`

## Acceptance criteria
- [ ] `docker compose --profile db up -d` → container healthy; `mongosh localhost:27017` connects
- [ ] Data survives `docker compose down && up` (named volume)
- [ ] No app service starts with the `db` profile

## Dependencies
Blocked by {{0.1}}.
@@END

@@ISSUE
key: E1
title: [EPIC] Phase 1 — Backend Foundation
labels: type:epic, phase:1, area:server
milestone: M1
---
## Phase goal
A runnable, production-shaped NestJS core: zod-validated config, Mongo with the canonical schemas, structured logging, a stable error contract, health endpoints, security middleware, exhaustive Swagger, the test harness, and seed/ops scripts. Every later module plugs into this foundation.

## Exit criteria (phase gate)
- [ ] `GET /api/v1/health/ready` green against local Mongo
- [ ] Boot fails fast (with named keys) on invalid/missing env
- [ ] Swagger UI + `/api/docs-json` live, with examples and the docs convention test active
- [ ] `yarn seed:admin` creates the first admin (idempotent)
- [ ] Server unit + e2e harness green in CI

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P1), §10 E1, §7 (architecture), §7.3 (env matrix).
@@END

@@ISSUE
key: 1.1
title: 1.1 — NestJS scaffold with /api/v1 prefix and strict TypeScript
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
The server skeleton everything else mounts onto. `CLAUDE.md` mandates global prefix `/api/v1` and a modular architecture.

## Scope
- NestJS 11 in `server/` (`@nestjs/platform-express`), strict `tsconfig` (all strict flags, `noUncheckedIndexedAccess`), path aliases (`@app/*`, `@config`, `@common/*`)
- `main.ts` bootstrap: global prefix `/api/v1`, URI versioning, `dev`/`build`/`start:prod` scripts
- Module layout folders per PLAN.md §7.1 (empty modules acceptable here)

## Subtasks
- [ ] Scaffold + strict tsconfig + aliases
- [ ] Bootstrap with prefix/versioning
- [ ] Workspace scripts (`yarn dev`, `yarn build`, `yarn start:prod`)

## Acceptance criteria
- [ ] `yarn dev` boots; `GET /api/v1/anything` returns the JSON 404 envelope (once {{1.5}} lands; plain 404 until then)
- [ ] `yarn build` emits runnable `dist/` (`node dist/main.js` boots)
- [ ] Typecheck clean under strict flags
- [ ] Path aliases resolve in build, tests and IDE

## Dependencies
Blocked by {{0.1}}, {{0.2}}.
@@END

@@ISSUE
key: 1.2
title: 1.2 — Typed config module with zod fail-fast env validation
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
All secrets/config come from `.env` (`CLAUDE.md`). Production systems fail at boot — not at first request — when configuration is broken.

## Scope
- Zod schema covering the full env matrix (PLAN.md §7.3): core, mongo, auth/JWT, OAuth (optional pairs), crypto, seed, storage, LLM, mail, throttle, observability
- Typed `AppConfig` (nested groups) via Nest `ConfigModule` + custom loader; injectable, no `process.env` access outside `config/`
- `.env.example` exhaustively documented (every key: purpose, format, default, required-in-prod?)
- Cross-field rules: e.g. OAuth provider keys must come in complete pairs; `STORAGE_DRIVER=s3` requires `S3_*`; prod requires real secrets (no defaults)

## Subtasks
- [ ] Env zod schema + loader + typed accessor
- [ ] Cross-field refinements
- [ ] `.env.example` + README env section
- [ ] ESLint restriction on `process.env` outside `config/`

## Acceptance criteria
- [ ] Boot with missing `MONGODB_URI` fails listing exactly that key; same for malformed values (bad URL, short secret)
- [ ] OAuth half-pair (id without secret) fails boot with a clear message
- [ ] Unit tests cover happy/invalid/cross-field cases
- [ ] Parity test: every key consumed by the schema exists in `.env.example` and vice versa

## Dependencies
Blocked by {{1.1}}.
@@END

@@ISSUE
key: 1.3
title: 1.3 — Mongo integration: port canonical schemas, indexes, hooks
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
`database/nestjs-mongoose/schemas.ts` is the approved data model (7 collections, indexes, TTLs, hooks, transforms). It becomes the live source under `server/src/database/`.

## Scope
- `DatabaseModule`: `MongooseModule.forRootAsync` from typed config; connection event logging; `autoIndex` dev-only
- Port schemas split per collection (`users.schema.ts`, `resumes.schema.ts`, …) keeping every index, TTL, partial filter, collation, hook (resume prune pre-validate) and `toJSON` transform **verbatim**
- Register via `MODEL_DEFINITIONS`; export typed models for DI

## Subtasks
- [ ] DatabaseModule with async config + event logging
- [ ] Port all 7 schemas + shared enums/subdocs
- [ ] Model registration + typed injection helpers
- [ ] Unit tests: prune hook, toJSON redaction (passwordHash, apiKeyEncrypted), date-regex props

## Acceptance criteria
- [ ] Server boots against compose Mongo ({{0.7}}); all 7 models registered
- [ ] Resume pre-validate prune covered by tests (placeholder strings/empty arrays/objects stripped)
- [ ] `toJSON` never emits `passwordHash`/`apiKeyEncrypted`/`tokenHash` (asserted)
- [ ] Index definitions match the source file one-to-one (test comparing `schema.indexes()` snapshots)

## Dependencies
Blocked by {{1.1}}, {{1.2}}, {{0.7}}.
@@END

@@ISSUE
key: 1.4
title: 1.4 — Structured logging (pino) with request correlation and redaction
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
Production observability baseline: JSON logs, one line per request, correlation ids, and guaranteed secret redaction.

## Scope
- nestjs-pino: request-id (uuid v7) generated/propagated via AsyncLocalStorage, attached to every log line
- Redaction paths: authorization/cookie headers, password*, token*, apiKey*, secrets
- Pretty transport in dev; pure JSON in prod; level from `LOG_LEVEL`
- Mongoose + bootstrap logs routed through the same logger

## Subtasks
- [ ] Logger module + ALS request context
- [ ] Redaction config + tests
- [ ] HTTP request/response log (method, path, status, duration, requestId, userId when present)
- [ ] Replace Nest default logger

## Acceptance criteria
- [ ] Every request produces exactly one completion log line with requestId; concurrent requests don't leak each other's context (ALS test)
- [ ] Redaction proven: login request log shows `[Redacted]` for password — never the value
- [ ] Uncaught exception logged once with stack, then handled by the filter ({{1.5}})
- [ ] `LOG_LEVEL=warn` silences info logs (test)

## Dependencies
Blocked by {{1.1}}, {{1.2}}.
@@END

@@ISSUE
key: 1.5
title: 1.5 — Global error contract + zod validation pipe
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
One stable, documented error envelope for the entire API; the frontend and Swagger docs both build on it.

## Scope
- Global exception filter → `{ statusCode, error, message, details?, requestId, timestamp, path }`
- nestjs-zod (or custom) validation pipe: DTOs from shared zod schemas; zod issues → 422 with field-path `details`
- Mongo error mapping: duplicate key → 409; version conflict (optimistic concurrency) → 409 with `conflict` detail; cast errors → 400
- Unknown `/api/**` route → JSON 404 envelope; prod hides internals (no stack/internal messages), dev includes them
- Typed domain exceptions (`AppException` hierarchy) for later modules

## Subtasks
- [ ] Exception filter + envelope type in `shared/`
- [ ] Validation pipe + zod→422 mapping
- [ ] Mongo error mapper
- [ ] Snapshot tests for every status family

## Acceptance criteria
- [ ] Contract snapshot-tested for 400/401/403/404/409/422/429/500
- [ ] 422 `details` lists exact zod paths (`basics.email`, `work[0].startDate`)
- [ ] Prod mode: 500 returns generic message + requestId only (asserted)
- [ ] Envelope documented in Swagger as the shared error schema with examples ({{1.9}})

## Dependencies
Blocked by {{1.1}}, {{1.4}}; envelope schema shared with {{3.1}}.
@@END

@@ISSUE
key: 1.6
title: 1.6 — Health module (liveness + readiness)
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
Docker healthchecks ({{11.1}}) and Railway ({{11.4}}) depend on these endpoints; readiness must reflect real dependencies.

## Scope
- `@nestjs/terminus`: `GET /api/v1/health/live` (process up) and `GET /api/v1/health/ready` (Mongo ping + disk space + memory heap thresholds)
- Public (no auth), exempt from rate limiting, excluded from request logging noise (sampled)
- No internal details leaked (hostnames, connection strings)

## Acceptance criteria
- [ ] `ready` returns 503 within 3s when Mongo is stopped (e2e against compose), 200 when restored
- [ ] `live` stays 200 even with Mongo down
- [ ] Response shape stable and documented in Swagger with healthy/unhealthy examples
- [ ] Thresholds configurable via env with sane defaults

## Dependencies
Blocked by {{1.3}}.
@@END

@@ISSUE
key: 1.7
title: 1.7 — Security middleware baseline (helmet, CORS, throttling, limits)
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
Non-negotiable production hardening applied globally before any feature endpoint exists.

## Scope
- helmet (CSP arrives in {{10.7}}; sensible defaults now), compression
- CORS: allowlist from `CORS_ORIGINS`, credentials enabled, preflight cached
- `@nestjs/throttler`: global default bucket + named strict buckets (`auth`, `upload`, `analysis`) consumed by later phases; storage in-memory (single instance per D7)
- Body limits (JSON 1MB; multipart handled per-route in {{3.5}}), cookie-parser with signed cookies (`COOKIE_SECRET`), `trust proxy` (Railway) so client IPs and rate limits are correct

## Acceptance criteria
- [ ] e2e asserts helmet headers present (nosniff, frame-options, referrer-policy…)
- [ ] Non-allowlisted origin: no CORS headers (browser-blocked); allowlisted origin works with credentials
- [ ] Exceeding the global bucket → 429 in the standard envelope with `Retry-After`
- [ ] 2MB JSON body → 413 envelope
- [ ] With `trust proxy`, `X-Forwarded-For` resolves the client IP used by the throttler (test)

## Dependencies
Blocked by {{1.1}}, {{1.2}}, {{1.5}}.
@@END

@@ISSUE
key: 1.8
title: 1.8 — Graceful shutdown & lifecycle management
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
Railway/Docker send SIGTERM on every deploy; in-flight requests and (later) running jobs must finish cleanly — no dropped analyses.

## Scope
- `app.enableShutdownHooks()`; SIGTERM/SIGINT: stop accepting connections → wait for in-flight requests → run `onApplicationShutdown` hooks (Mongo disconnect; job-runner drain hook reserved for {{4.3}}) → exit 0; bounded by `SHUTDOWN_TIMEOUT_MS` (default 25s) → forced exit 1 with log

## Acceptance criteria
- [ ] Integration test: SIGTERM during a 2s-long request → request completes 200, process exits 0
- [ ] Mongo connection closed exactly once (no duplicate-close warnings)
- [ ] Timeout path: a hung hook triggers forced exit 1 after the bound, with an error log
- [ ] Documented in runbook ({{10.8}})

## Dependencies
Blocked by {{1.3}}.
@@END

@@ISSUE
key: 1.9
title: 1.9 — Swagger/OpenAPI: exhaustive, example-rich, JSON-exposed
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
API documentation is a first-class deliverable: exhaustive, example-rich, and machine-consumable. The convention test created here enforces the documentation contract on **every endpoint in every later phase**.

## Scope
- `@nestjs/swagger` + zod→OpenAPI bridge; UI at `/api/docs`; raw spec **exposed as JSON at `/api/docs-json`** (and YAML at `/api/docs-yaml`); all gated by `SWAGGER_ENABLED` (default on in dev, off in prod)
- bearer + cookie auth schemes; tag-per-module with descriptions
- Documentation contract (per endpoint): summary + meaningful description; all path/query/body params with types, constraints, enums; response schema **per status code** (success + every applicable error using the {{1.5}} envelope); ≥1 realistic request example and ≥1 response example per documented status; auth markers; pagination params defined once and `$ref`-erenced
- Examples derive from shared zod schemas + named fixtures (complete sample json-resume, full analysis result)
- Convention test: fails CI if any route lacks summary/description, a success example, or documented error responses
- CI artifact: `openapi.json` generated from `/api/docs-json` per build (wired in {{0.6}}/{{11.3}})

## Subtasks
- [ ] Swagger setup + JSON/YAML spec routes + env gate
- [ ] zod→OpenAPI bridge + shared error schema + pagination components
- [ ] Named example fixtures
- [ ] Docs convention test
- [ ] CI artifact step

## Acceptance criteria
- [ ] Spec validates as OpenAPI 3.1
- [ ] `GET /api/docs-json` returns the complete spec, `application/json`, e2e-tested to match the UI spec exactly
- [ ] Convention test red when a test-fixture route omits summary/example/error docs (proven), green otherwise
- [ ] Health + (as they land) auth/resume/analysis/admin/export endpoints render runnable examples in the UI
- [ ] All docs routes 404 in prod unless `SWAGGER_ENABLED=true`

## Dependencies
Blocked by {{1.1}}, {{1.2}}, {{1.5}}.
@@END

@@ISSUE
key: 1.10
title: 1.10 — Server test harness (jest, mongodb-memory-server, factories)
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
Every later server issue writes tests against this harness; it must be fast, isolated and ergonomic.

## Scope
- Jest + ts-jest (path aliases mapped), separate unit and e2e projects
- mongodb-memory-server helper (per-suite instance, clean DB per test)
- supertest app factory booting the real AppModule with test env overrides
- Data factories: user (candidate/admin), resume (created/uploaded, full json-resume fixture), analysis (per status)
- Coverage thresholds ≥80% lines/branches on `src/**` (bootstrap excluded); `yarn test`, `test:e2e`, `test:cov` wired to CI and pre-commit related-tests ({{0.3}})

## Acceptance criteria
- [ ] Example unit + e2e tests green locally and in CI
- [ ] Suites run in parallel without cross-contamination (two suites mutating same collections)
- [ ] Factories produce schema-valid documents (validated against Mongoose models)
- [ ] Coverage gate fails the build when under threshold (demonstrated)

## Dependencies
Blocked by {{1.1}}, {{1.3}}.
@@END

@@ISSUE
key: 1.11
title: 1.11 — Seed & ops scripts (admin bootstrap, index sync)
labels: type:task, phase:1, area:server, priority:P0
milestone: M1
parent: E1
---
Part of {{E1}}.

## Context
PROMPT.md forbids an admin registration flow — without a seed, no admin can ever exist. Prod runs with `autoIndex` off, so indexes need an explicit sync path.

## Scope
- `yarn seed:admin`: creates admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (argon2id via {{2.1}}'s hasher — temporary local hasher until then), idempotent (existing → no-op with log), `emailVerified=true`
- `yarn db:indexes`: `Model.syncIndexes()` across all models with diff report (created/dropped)
- Both runnable locally and inside the container (`node dist/scripts/…`); documented in runbook

## Acceptance criteria
- [ ] Running seed twice yields exactly one admin (asserted by test)
- [ ] Seeded admin can log in once {{2.1}} lands (verified then)
- [ ] `db:indexes` on a fresh DB creates every index from {{1.3}} (listed and compared); running again reports no changes
- [ ] Scripts exit non-zero on failure with clear errors (bad env, no Mongo)

## Dependencies
Blocked by {{1.2}}, {{1.3}}.
@@END

@@ISSUE
key: E2
title: [EPIC] Phase 2 — AuthN/AuthZ & Users
labels: type:epic, phase:2, area:server
milestone: M2
---
## Phase goal
Production-grade identity: email+password auth with argon2id, short-lived JWTs with rotating refresh tokens and reuse detection, RBAC, feature-flagged Google/LinkedIn OAuth, email verification and password reset, self-service user endpoints, and abuse protection. One login flow for candidates and admins (role decided by backend RBAC, per PROMPT.md).

## Exit criteria (phase gate)
- [ ] Full auth lifecycle (register → verify → login → refresh → logout) covered by e2e tests incl. abuse paths
- [ ] `GET /api/v1/auth/providers` reflects env feature flags
- [ ] Refresh-token reuse revokes the session family (proven by test)
- [ ] `security-review` skill run on the phase diff; findings fixed or ticketed
- [ ] Coverage ≥85% on auth module

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P2), §10 E2; schemas: `users`, `authtokens`, `auditlogs`.
@@END

@@ISSUE
key: 2.1
title: 2.1 — Local registration & login (argon2id, timing-safe)
labels: type:task, phase:2, area:server, priority:P0
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
The entry point to the product. Must not leak account existence and must store credentials irreversibly.

## Scope
- `POST /api/v1/auth/register`: email + fullName + password (strength policy: ≥10 chars, mixed classes — zod-enforced, documented); argon2id hash (tuned params); audit `user.register`; triggers verification mail ({{2.5}})
- `POST /api/v1/auth/login`: verifies hash; issues token pair ({{2.2}}); audit `user.login`; updates `lastActiveAt`
- Uniform error + timing for unknown-email vs wrong-password (single generic 401; argon2 verify against dummy hash for unknown users)
- Deactivated accounts: 403 with explicit message

## Subtasks
- [ ] AuthModule + controller/service + DTOs (shared zod)
- [ ] Argon2id hasher service (params from config; reused by {{1.11}} seed)
- [ ] Register/login flows + audit events
- [ ] e2e: happy, duplicate, weak password, wrong creds, deactivated

## Acceptance criteria
- [ ] Register → login → `GET /users/me` e2e green
- [ ] Duplicate email (case-insensitive per collation index) → 409 envelope
- [ ] Weak password → 422 with policy details
- [ ] Unknown-email and wrong-password responses are byte-identical and statistically close in timing (sampled test)
- [ ] Password hash never appears in any response or log (asserted)

## Dependencies
Blocked by {{1.3}}, {{1.5}}, {{1.10}}.
@@END

@@ISSUE
key: 2.2
title: 2.2 — JWT access + rotating refresh tokens with reuse detection
labels: type:task, phase:2, area:server, priority:P0
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
Session security core. Refresh rotation with family revocation is what makes stolen-token replay survivable.

## Scope
- Access JWT: 15m TTL, HS256 pinned, issuer/audience claims, `sub`+`role`; delivered in httpOnly Secure SameSite=Lax cookie (plus response body for API clients)
- Refresh: opaque 256-bit token, 30d TTL, httpOnly cookie scoped to `/api/v1/auth`; stored as SHA-256 in `authtokens` with ip/userAgent; one row per session
- `POST /auth/refresh`: validates + consumes old row, issues new pair (rotation); **reuse of a consumed token → revoke entire user session family + audit + 401**
- `POST /auth/logout`: revokes current session row + clears cookies
- TTL index cleanup verified; clock-skew tolerance on JWT validation

## Acceptance criteria
- [ ] Refresh rotates: old refresh 401s afterward; new pair works
- [ ] Reuse detection: replaying a consumed refresh revokes all the user's sessions (subsequent refreshes 401) + audit row written
- [ ] Expired access + valid refresh recovers the session transparently
- [ ] Cookies: httpOnly, Secure (prod), SameSite=Lax, correct paths (asserted in e2e)
- [ ] JWT alg confusion rejected (`none`/RS256 tokens fail)

## Dependencies
Blocked by {{2.1}}.
@@END

@@ISSUE
key: 2.3
title: 2.3 — RBAC guards & request identity context
labels: type:task, phase:2, area:server, priority:P0
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
PROMPT.md: admin vs candidate is dictated by backend RBAC — one login flow. Every later module relies on these guards.

## Scope
- Global `JwtAuthGuard` (opt-out via `@Public()`), `@Roles(UserRole.ADMIN)` + `RolesGuard`, `@CurrentUser()` param decorator (typed)
- `ActiveUserGuard`: re-checks `status` per request so deactivation takes effect immediately
- `lastActiveAt` update throttled to once per 5 min per user (no write amplification)

## Acceptance criteria
- [ ] Denial matrix e2e: anonymous → 401; candidate → admin route 403; admin → admin route 200; deactivated user with valid JWT → 403
- [ ] `@Public()` routes (health, landing auth endpoints, SPA) bypass auth
- [ ] `lastActiveAt` write happens at most once in a 5-min window under request burst (test)
- [ ] Guards covered by unit tests incl. malformed/expired tokens

## Dependencies
Blocked by {{2.2}}.
@@END

@@ISSUE
key: 2.4
title: 2.4 — Google + LinkedIn OAuth (feature-flagged via env)
labels: type:task, phase:2, area:server, priority:P1
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
PROMPT.md requires Google and LinkedIn login. Per approved decision D4: fully implemented, each provider active **only when its keys exist in `.env`**; frontend discovers availability at runtime.

## Scope
- Passport OIDC strategies (Google; LinkedIn OpenID Connect) registered conditionally from config
- `GET /api/v1/auth/providers` (public) → `{ "google": bool, "linkedin": bool }`
- Callback flow: state+nonce CSRF protection; link identity to existing user by **verified** email, else create user (`emailVerified=true`, no password); honors unique `(provider, providerUserId)` index; issues standard token pair ({{2.2}}); audit
- Account linking conflicts (identity already bound to another user) → explicit 409
- `OAUTH_CALLBACK_BASE_URL` drives redirect URIs (local vs Railway)

## Acceptance criteria
- [ ] With no OAuth env: providers endpoint reports both false; OAuth routes return 404; server boots clean
- [ ] With Google env only: google=true, linkedin=false; google flow works (strategy-mocked e2e)
- [ ] Mocked e2e: new-user creation, existing-verified-email linking, duplicate-identity 409
- [ ] Unverified-email match does NOT auto-link (creates separate account path documented)
- [ ] Client secrets never logged (redaction test) and never serialized

## Dependencies
Blocked by {{2.2}}, {{2.3}}.
@@END

@@ISSUE
key: 2.5
title: 2.5 — Email verification & password reset (Mail abstraction)
labels: type:task, phase:2, area:server, priority:P1
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
Account recovery and verified identities, with zero local setup (console mail driver) per D13.

## Scope
- `MailModule`: `MailService` interface; `console` driver (default — logs rendered mail), `smtp` driver (nodemailer, env-configured); templated emails (verify, reset)
- Tokens: single-use, SHA-256-stored in `authtokens` (kinds `email_verify` 24h / `password_reset` 1h)
- `POST /auth/verify-email` (token) → sets `emailVerified`
- `POST /auth/forgot-password` (email) → uniform 202 regardless of account existence (no enumeration); strict throttle bucket
- `POST /auth/reset-password` (token + new password) → updates hash, consumes token, **revokes all refresh sessions**, audit

## Acceptance criteria
- [ ] Full reset e2e using the console driver (token captured from mail log)
- [ ] Token reuse and expired token → 400; token of wrong kind rejected
- [ ] Forgot-password: identical response/timing for existing vs unknown email
- [ ] Reset invalidates every active session (refresh 401s after)
- [ ] SMTP driver covered by integration test against a local test transport

## Dependencies
Blocked by {{2.1}}, {{2.2}}.
@@END

@@ISSUE
key: 2.6
title: 2.6 — Users module: profile self-service & dashboard counters
labels: type:task, phase:2, area:server, priority:P0
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
The authenticated user's own surface: profile, password change, and the counters the dashboard renders.

## Scope
- `GET /api/v1/users/me`: sanitized profile (id, email, fullName, avatarUrl, role, emailVerified, createdAt, resumeCount, analysisCount, linked providers list — provider names only)
- `PATCH /api/v1/users/me`: fullName, avatarUrl (zod URL)
- `POST /api/v1/users/me/password`: requires current password; rejects for OAuth-only accounts (no hash) with guidance; revokes other sessions on success

## Acceptance criteria
- [ ] Contract tests for all three endpoints incl. Swagger examples
- [ ] Wrong current password → 403; OAuth-only account → 409 with explicit error code
- [ ] Response never includes hash, identities' raw tokens/ids, or internal fields (DTO whitelist test)
- [ ] Password change keeps current session, revokes others (e2e with two sessions)

## Dependencies
Blocked by {{2.2}}, {{2.3}}.
@@END

@@ISSUE
key: 2.7
title: 2.7 — Auth abuse protection: strict throttling + progressive lockout
labels: type:task, phase:2, area:server, priority:P1
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
Credential stuffing and brute force are table stakes attacks; auth endpoints get dedicated protection beyond the global bucket.

## Scope
- Strict throttle bucket ({{1.7}}) applied to register/login/forgot/reset (per-IP and per-email keys)
- Progressive lockout: after N failed logins per account (env-tunable, default 5/15min) → exponential backoff windows; counter reset on success; audit on lockout engage
- Lockout responses use the 429 envelope with `Retry-After`; no account-existence leak (same behavior for unknown emails)

## Acceptance criteria
- [ ] 6th failed login within window → 429 with Retry-After; succeeds after window (clock-mocked e2e)
- [ ] Lockout for `a@x.com` does not affect `b@x.com` or other IPs
- [ ] Unknown-email lockout behavior identical to real-account (no oracle)
- [ ] Audit row on lockout with redacted meta
- [ ] Legitimate user flow unaffected under threshold (regression e2e)

## Dependencies
Blocked by {{2.1}}, {{1.7}}.
@@END

@@ISSUE
key: 2.8
title: 2.8 — Auth/users consolidated test suite + security review
labels: type:task, phase:2, area:server, priority:P0
milestone: M2
parent: E2
---
Part of {{E2}}.

## Context
Phase gate: the identity layer is the highest-risk surface in the app; it closes only with proven coverage and an explicit security pass.

## Scope
- Consolidate unit+e2e across 2.1–2.7: happy paths, abuse paths, expiry/rotation/reuse, OAuth conflicts, enumeration checks
- Run the `security-review` skill over the full phase diff; fix or ticket findings
- Coverage report wired to CI summary

## Acceptance criteria
- [ ] Coverage ≥85% lines/branches on `auth/`, `users/`, `mail/`
- [ ] Every PROMPT.md auth requirement traced to at least one test (traceability list in PR)
- [ ] Security review completed; zero open high/critical findings
- [ ] Full suite < 90s in CI

## Dependencies
Blocked by {{2.1}}, {{2.2}}, {{2.3}}, {{2.4}}, {{2.5}}, {{2.6}}, {{2.7}}.
@@END

@@ISSUE
key: E3
title: [EPIC] Phase 3 — Resume Domain
labels: type:epic, phase:3, area:server
milestone: M3
---
## Phase goal
The resume aggregate end-to-end on the server: shared json-resume zod schemas, CRUD with optimistic concurrency and placeholder hygiene, dashboard stats, the storage abstraction, file upload with real validation, and text extraction for PDF/DOC/DOCX. AI parsing of uploads arrives in Phase 4 — this phase ends with `originalText` extracted and stored.

## Exit criteria (phase gate)
- [ ] Create/list/edit/soft-delete resumes via API with ownership enforced
- [ ] Upload stores the original file + extracts text for all three formats
- [ ] Placeholder pruning proven end-to-end (client placeholder → absent in DB)
- [ ] Coverage ≥80% across the module

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P3), §10 E3; schema: `resumes`; PROMPT.md (dashboard, upload, editor features).
@@END

@@ISSUE
key: 3.1
title: 3.1 — Shared json-resume zod schemas + prune utility (shared/)
labels: type:task, phase:3, area:shared, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
The canonical resume shape lives once in `shared/` and is consumed by server validation, LLM structured output, and the frontend form — single source of truth (D9, PROMPT.md json-resume requirement).

## Scope
- Zod mirror of the json-resume-schema: basics (+location, profiles), work, volunteer, education, awards, certificates, publications, skills, languages, interests, references, projects, meta — field constraints aligned with the Mongoose schema (lengths, URL/email patterns, partial-date regex `YYYY | YYYY-MM | YYYY-MM-DD`)
- `pruneEmpty` util mirroring the Mongoose pre-validate hook (strip empty strings/arrays/objects recursively) — used client-side before submit and in the LLM pipeline
- API DTO schemas/types and shared enums re-exported; error envelope type ({{1.5}})
- Named fixtures: complete sample resume (every section), minimal resume

## Acceptance criteria
- [ ] The official json-resume sample document parses successfully
- [ ] Property-based tests: `pruneEmpty` output never contains empty strings/arrays/objects at any depth; idempotent
- [ ] Partial-date validation accepts the three formats, rejects `2024-13`, `2024-02-30`, free text
- [ ] Package builds and is imported by both `server/` and `frontend/` (workspace integration test)
- [ ] zod schemas and Mongoose schema agree on constraints (snapshot comparison test for lengths/patterns)

## Dependencies
Blocked by {{0.1}}; aligns with {{1.3}}.
@@END

@@ISSUE
key: 3.2
title: 3.2 — Resume CRUD with ownership, optimistic concurrency, soft delete
labels: type:task, phase:3, area:server, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
Core CRUD backing the dashboard table, the editor and the in-place edit UX (PROMPT.md). Concurrency-safe because the in-place editor and apply-suggestions can race.

## Scope
- `POST /api/v1/resumes` (`source=created`, name + jsonResume) — name unique per user among live docs → 409
- `GET /api/v1/resumes` — paginated/sorted projection for the dashboard table: name, createdAt, lastAnalyzedAt, analysisStatus, analysisCount, source
- `GET /api/v1/resumes/:id` — full document (owner only)
- `PATCH /api/v1/resumes/:id` — rename and/or jsonResume update; requires `version` (optimistic concurrency) → 409 conflict envelope on mismatch
- `DELETE /api/v1/resumes/:id` — soft delete (`deletedAt`, `deletedBy`), audit `resume.delete`, decrements user counter
- Every query scoped `{ userId, deletedAt: null }`; foreign/missing id → 404 (no existence leak)

## Acceptance criteria
- [ ] CRUD e2e green incl. pagination/sort contract (page, limit, sortBy, order with bounds)
- [ ] Placeholder hygiene end-to-end: PATCH with placeholder-only fields → fields absent in DB (inspected), prune hook + shared `pruneEmpty` agree
- [ ] Version conflict: two parallel PATCHes — second gets 409 with current version in details
- [ ] Foreign-user id → 404; soft-deleted → 404 everywhere incl. name-uniqueness freeing the name
- [ ] Swagger: full examples for every endpoint incl. 409 conflict and 422 validation bodies

## Dependencies
Blocked by {{3.1}}, {{2.3}}, {{1.5}}.
@@END

@@ISSUE
key: 3.3
title: 3.3 — Dashboard stats endpoint + counter reconcile job
labels: type:task, phase:3, area:server, priority:P1
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
Dashboard shows resumes-created and analyses-run counts. Denormalized counters drift without transactions (D15) — a reconcile job keeps them honest.

## Scope
- `GET /api/v1/users/me/stats` → `{ resumeCount, analysisCount }` from user doc (O(1))
- `$inc` maintenance on resume create/soft-delete (analysis counter increments arrive with {{4.5}})
- Reconcile job (cron-style, nightly + on-demand script `yarn db:reconcile-counters`): recompute from `resumes`/`analyses` collections, fix drift, log corrections

## Acceptance criteria
- [ ] Stats correct after create/create/delete churn (e2e)
- [ ] Artificially skewed counter is corrected by reconcile (test); correction logged with before/after
- [ ] Reconcile is idempotent and bounded (batched user scan, no full-collection load into memory)
- [ ] Counter never goes negative (guarded `$inc` with floor)

## Dependencies
Blocked by {{3.2}}.
@@END

@@ISSUE
key: 3.4
title: 3.4 — StorageService abstraction (local disk + optional S3 driver)
labels: type:task, phase:3, area:server, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
Original files never live in Mongo (`storageKey` per schema). Local/Railway use a disk volume; S3-compatible is a config switch away (D8).

## Scope
- `StorageService` interface: `put(stream|buffer) → {key, sha256, size}`, `getStream(key)`, `delete(key)`, `stat(key)`; driver chosen by `STORAGE_DRIVER`
- `LocalDiskStorage`: rooted at `UPLOAD_DIR`; generated keys (`{userId}/{uuid}.{ext}`) — **no client-controlled paths**; traversal-safe join with verification; atomic write (tmp+rename) + fsync; sha256 computed during streaming
- `S3Storage`: any S3-compatible endpoint (`S3_ENDPOINT`, bucket, creds); same semantics; lazy-loaded only when selected
- Orphan-file cleanup helper (delete storage object when resume hard-cleanup occurs)

## Acceptance criteria
- [ ] Driver selection by env proven (boot log + behavior); `s3` without `S3_*` fails boot via {{1.2}}
- [ ] Path traversal attempts (`../`, absolute paths, null bytes in names) rejected (unit tests) — keys are server-generated regardless
- [ ] Local: file survives process restart; stream read matches written bytes; sha256 stable
- [ ] S3 driver integration-tested against MinIO (CI service container, optional job)
- [ ] `stat` on missing key → typed NotFound error (mapped to 404 by {{1.5}})

## Dependencies
Blocked by {{1.2}}.
@@END

@@ISSUE
key: 3.5
title: 3.5 — Upload endpoint: multipart, size cap, MIME + magic-byte validation
labels: type:task, phase:3, area:server, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
The upload entry of the PROMPT.md flow. File validation must not trust the client: extension, declared MIME and magic bytes must all agree.

## Scope
- `POST /api/v1/resumes/upload` (multipart, field `file`): ≤10MB (multer limits), allowed types pdf/doc/docx
- Triple check: extension ∈ allowlist, declared MIME ∈ allowlist, sniffed magic bytes (`file-type`; OLE2 header for legacy .doc) agree with each other → else 422
- Store via StorageService → create Resume (`source=uploaded`, `originalFile{fileName,mimeType,sizeBytes,storageKey,sha256}`, `uploadParse.status=pending`, name from filename with ` (2)` dedupe suffix, empty jsonResume)
- Strict `upload` throttle bucket; response: resume id + parse-status polling URL (parse job enqueued by {{4.4}})

## Acceptance criteria
- [ ] Happy path per format: 201 with resume id; file retrievable via storage with matching sha256
- [ ] 11MB file → 413 envelope; .exe renamed to .pdf → 422 (magic-byte mismatch named in details)
- [ ] Duplicate filename → name dedupe suffix honoring the unique index
- [ ] Throttle: burst beyond bucket → 429
- [ ] No partial state on failure: validation error leaves neither file in storage nor resume row (cleanup asserted)

## Dependencies
Blocked by {{3.2}}, {{3.4}}, {{1.7}}.
@@END

@@ISSUE
key: 3.6
title: 3.6 — Text extraction service (PDF / DOCX / legacy DOC)
labels: type:task, phase:3, area:server, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
Extracted text feeds the AI parser ({{4.4}}) and the upload-review split screen (PROMPT.md). Per CLAUDE.md: LangChain pdf loader + mammoth; legacy `.doc` needs word-extractor (D10 — mammoth is docx-only).

## Scope
- `ExtractionService.extract(storageKey, mimeType) → { text, meta }`
- PDF: LangChain `PDFLoader` (pdf-parse); DOCX: mammoth `extractRawText`; DOC: word-extractor
- Normalization: collapse whitespace runs, normalize newlines/encoding, strip control chars; cap 200k chars (schema bound) with truncation flag
- Typed errors: `EncryptedPdf`, `CorruptFile`, `EmptyText` (image-only PDFs), `UnsupportedFormat` — all mapped to user-meaningful parse failures

## Acceptance criteria
- [ ] Fixture suite: real pdf/docx/doc resumes extract non-empty, ordered text (golden snapshots)
- [ ] Corrupt file, password-protected PDF, image-only PDF → correct typed error (no crash, no hang; 30s timeout)
- [ ] 250k-char document truncates to 200k with flag set
- [ ] Output lands on `resume.originalText` via the upload flow (integration with {{3.5}})

## Dependencies
Blocked by {{3.4}}, {{3.5}}.
@@END

@@ISSUE
key: 3.7
title: 3.7 — Resume module consolidated test suite
labels: type:task, phase:3, area:server, priority:P0
milestone: M3
parent: E3
---
Part of {{E3}}.

## Context
Phase gate: the resume aggregate is the data heart of the product; concurrency, pruning and upload abuse must be regression-proofed before AI lands on top.

## Scope
- Consolidate unit+e2e across 3.1–3.6; add cross-cutting scenarios: concurrent PATCH vs DELETE, upload→extract→read-back, ownership sweep over every route with a foreign user
- Coverage report per module in CI summary

## Acceptance criteria
- [ ] Coverage ≥80% on `resumes/`, `storage/`, `shared` schemas
- [ ] Ownership/IDOR sweep: every resume route × foreign id → 404 (table-driven e2e)
- [ ] Race tests deterministic (no flake across 10 CI runs)
- [ ] Every PROMPT.md resume requirement traced to a test (list in PR)

## Dependencies
Blocked by {{3.1}}, {{3.2}}, {{3.3}}, {{3.4}}, {{3.5}}, {{3.6}}.
@@END

@@ISSUE
key: E4
title: [EPIC] Phase 4 — AI Platform & Analysis Pipeline
labels: type:epic, phase:4, area:server
milestone: M4
---
## Phase goal
Everything AI: the admin-manageable model registry with encrypted keys, the LangChain LLM service with structured output and a deterministic fake provider, the Mongo-backed job runner, the upload→json-resume parsing pipeline, the 3-step analysis pipeline with persisted results, suggestion application, and LLM observability with cost guards.

## Exit criteria (phase gate)
- [ ] With `LLM_PROVIDER=fake`: upload parses end-to-end; analysis completes all 3 steps with persisted results
- [ ] Retries, crash recovery and graceful drain proven by tests
- [ ] One real-OpenAI manual smoke (1 parse + 1 analysis) recorded in this epic
- [ ] Coverage ≥80% across `ai/`, `jobs/`, `analyses/`

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P4), §10 E4, D7/D9; schemas: `aimodels`, `analyses`.
@@END

@@ISSUE
key: 4.1
title: 4.1 — CryptoService (AES-256-GCM) + AI model registry service
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
Admin-managed models with provider API keys encrypted at rest (PROMPT.md Settings; `aimodels` schema). Resolution order makes the app usable with nothing but `.env` (D9).

## Scope
- `CryptoService`: AES-256-GCM with `MASTER_ENCRYPTION_KEY` (32-byte base64, validated at boot); random IV per encryption; ciphertext stores `iv.tag.data`; decrypt verifies auth tag
- `AiModelsService` (internal — admin HTTP endpoints arrive in {{6.4}}): create (encrypt key, store `apiKeyLast4`), list (masked), update status/usages, rotate key, resolve-for-usage
- Resolution: active DB model for usage (`resume_parsing` | `analysis` | `fallback`) → else env fallback (`OPENAI_API_KEY` + per-usage model names); typed `ResolvedModel { provider, modelName, apiKey, baseURL? }`

## Acceptance criteria
- [ ] Encrypt→decrypt round-trip; tampered ciphertext/tag → typed decrypt failure (never partial plaintext)
- [ ] Raw key absent from JSON, logs and errors (transform + redaction tests)
- [ ] Resolution matrix tested: DB model present/absent × env fallback present/absent × disabled model (skipped)
- [ ] Rotation re-encrypts, updates `apiKeyLast4`, bumps `updatedAt`; old ciphertext unusable
- [ ] Boot fails on malformed `MASTER_ENCRYPTION_KEY` via {{1.2}}

## Dependencies
Blocked by {{1.2}}, {{1.3}}.
@@END

@@ISSUE
key: 4.2
title: 4.2 — LlmService: LangChain + structured output + fake provider
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
Single chokepoint for every LLM call (CLAUDE.md: langchain + langchain-openai). Deterministic fake provider keeps the entire test pyramid and E2E suite LLM-independent (D17).

## Scope
- `LlmService.invokeStructured(usage, prompt, zodSchema, opts)`: builds `ChatOpenAI` from `ResolvedModel` ({{4.1}}) with `baseURL` support; `withStructuredOutput(zodSchema)`
- Resilience: per-call timeout (`LLM_TIMEOUT_MS`), bounded retries with exponential backoff + jitter (`LLM_MAX_RETRIES`), one schema-repair retry on invalid structured output, typed errors (`LlmTimeout`, `LlmQuota`, `LlmInvalidOutput`, `LlmAuth`)
- Token usage captured per call `{prompt, completion, total}` and returned to callers
- `FakeLlmProvider` (`LLM_PROVIDER=fake`): deterministic fixtures keyed by usage + prompt markers (parse fixture, 3 analysis-step fixtures, failure triggers for tests)

## Acceptance criteria
- [ ] Invalid JSON from model → one repair retry → on second failure typed `LlmInvalidOutput` (mock-driven test)
- [ ] Retry/backoff verified with fake timers (timing bounds asserted); quota errors not retried beyond config
- [ ] Fake provider returns byte-identical output across runs; failure triggers work
- [ ] Token usage accurately surfaced (mocked usage metadata)
- [ ] API keys never appear in errors/logs even on auth failure (redaction test)

## Dependencies
Blocked by {{4.1}}.
@@END

@@ISSUE
key: 4.3
title: 4.3 — Mongo-backed job runner (claim, heartbeat, recovery, drain)
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
Analyses take 30–45s — they must survive deploys and crashes. The `analyses` schema already carries the worker-queue index; per D7 we run a Mongo-backed runner behind an interface (BullMQ-swappable later).

## Scope
- `JobRunner` interface (`enqueue`, `process(handler)`, `drain`) + Mongo implementation over job-bearing collections (analyses; upload parses)
- Atomic claim: `findOneAndUpdate(status=pending → in_progress, owner, heartbeatAt)` oldest-first; concurrency limit env-tunable (default 2)
- Heartbeat every 10s while processing; recovery scan (boot + every 60s): `in_progress` with stale heartbeat (>45s) → re-queue with `retryCount++`; `retryCount > 5` → failed with error
- Graceful drain on SIGTERM (hooks into {{1.8}}): stop claiming, finish in-flight, bounded by shutdown timeout
- Structured logs + (later) OTel spans per job ({{10.5}})

## Acceptance criteria
- [ ] Race test: two runner instances over one queue — every job claimed exactly once (1000-job stress in memory server)
- [ ] Kill-during-processing simulation: stale job recovered, completed by survivor, `retryCount` incremented
- [ ] Retry exhaustion → failed with persisted error; no infinite loops (clock-mocked)
- [ ] Drain: SIGTERM with one in-flight job → job completes, no new claims, clean exit (integration with {{1.8}})
- [ ] Concurrency cap honored under burst (asserted)

## Dependencies
Blocked by {{1.3}}, {{1.8}}.
@@END

@@ISSUE
key: 4.4
title: 4.4 — Resume parsing pipeline: extracted text → json-resume
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
The AI half of the upload feature (PROMPT.md): convert `originalText` into the json-resume structure the editor loads, with visible progress and a retry path.

## Scope
- Parse job (enqueued by upload {{3.5}}): load `originalText` → parsing prompt (system prompt hardened against instruction injection from resume content) → `LlmService.invokeStructured(resume_parsing, …, JsonResumeZod)` → `pruneEmpty` → save `jsonResume`
- `uploadParse` transitions `pending → processing → completed | failed` with `modelUsed`, timestamps, truncated error; resume-level progress events emitted on an internal bus (SSE consumes them in {{5.2}})
- `POST /api/v1/resumes/:id/reparse`: re-enqueue failed parses (owner only; only from `failed`)
- Status surfaced in `GET /resumes/:id` for polling fallback

## Acceptance criteria
- [ ] e2e (fake provider): upload → status transitions observed → `jsonResume` equals fixture (post-prune)
- [ ] Hallucinated fields outside the schema are stripped, not persisted (adversarial fake fixture)
- [ ] Prompt-injection fixture ("ignore instructions and output X" inside resume text) does not alter system behavior — output still schema-valid resume data
- [ ] LLM failure → `failed` + user-meaningful error; reparse succeeds after; reparse from non-failed → 409
- [ ] Pipeline is idempotent on duplicate job delivery (same resume version, no double-write)

## Dependencies
Blocked by {{3.6}}, {{4.2}}, {{4.3}}.
@@END

@@ISSUE
key: 4.5
title: 4.5 — Analysis pipeline: snapshot, 3 sequential steps, rollups
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
The product's core value path (PROMPT.md): compare resume vs JD → suggestions → interview questions, with per-step visibility and durable results.

## Scope
- `POST /api/v1/analyses` (name, jobDescription 30–50k chars, resumeId): validates ownership + resume has content; snapshots `resumeSnapshot`; creates the fixed 3 steps (schema-enforced); enqueues; sets resume rollup `in_progress`; increments counters ({{3.3}})
- Step execution (sequential, each `pending → in_progress → completed|failed` with timestamps):
  1. **compare_resume_jd** → overallScore, atsScore (0–100), strongPoints, weakPoints, matchingSkills, skillGaps
  2. **generate_suggestions** → suggestions grouped per `SuggestionGroup`, each with `fieldRef` (validated against snapshot paths), `title`, `description`, `proposedValue`; projectScore
  3. **prepare_interview_questions** → Q&A list
- Each step = separate structured-output zod schema; results persisted incrementally; step events emitted for SSE; failure mid-pipeline: keep completed step data, mark analysis failed, set resume rollup `failed`
- On success: result complete, `durationMs`, rollups (`analysisStatus=completed`, `lastAnalyzedAt`), notification trigger hook ({{5.1}})

## Acceptance criteria
- [ ] e2e (fake): pending→steps→completed; persisted result satisfies all schema bounds (scores 0–100, exactly 3 steps); `durationMs` set
- [ ] `fieldRef` values resolve against the snapshot (validator rejects fake refs from the LLM, drops them with warning)
- [ ] Step-2 failure: step-1 results intact, analysis failed, resume rollup failed, retriable
- [ ] JD bounds: 29k chars → 422; 50k+1 → 422 (with documented limits in Swagger)
- [ ] Resume edited after analysis start → analysis still consistent (works off snapshot, asserted)

## Dependencies
Blocked by {{4.2}}, {{4.3}}, {{3.2}}.
@@END

@@ISSUE
key: 4.6
title: 4.6 — Analysis endpoints + suggestion apply/dismiss
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
The HTTP surface for analyses and the "Apply suggestions to the resume" feature (PROMPT.md) that mutates the live resume per `fieldRef`.

## Scope
- `GET /api/v1/analyses` (paginated; filter `resumeId`, `status`) · `GET /api/v1/analyses/:id` (full result; also auto-clears its notification per {{5.1}} rule)
- `POST /api/v1/analyses/:id/retry` (from `failed` only — resets failed steps, re-enqueues) · `POST /api/v1/analyses/:id/cancel` (from `pending` only)
- `POST /api/v1/analyses/:id/suggestions/:sid/apply`: applies `proposedValue` at `fieldRef` on the **live resume** (deep path incl. array indices like `work[0].highlights[2]`), optimistic concurrency, marks `applied`+`appliedAt`
- `POST …/dismiss` marks dismissed; both idempotent
- Ownership on every route; state-machine violations → 409 with current state

## Acceptance criteria
- [ ] Apply mutates exactly the targeted field — deep-path table tests (scalar, nested object, array element, array append) with surrounding data untouched
- [ ] Apply on soft-deleted resume → 410; stale resume version → 409; second apply → idempotent no-op (still `applied`)
- [ ] Cancel on in_progress → 409; retry on completed → 409 (state machine table test)
- [ ] List pagination/filter contract tested; foreign ids → 404 everywhere
- [ ] Swagger examples include a full analysis result and an apply request/response pair

## Dependencies
Blocked by {{4.5}}.
@@END

@@ISSUE
key: 4.7
title: 4.7 — LLM observability (LangSmith/Langfuse) + cost guards
labels: type:task, phase:4, area:server, priority:P1
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
Per approved scope: LLM tracing and runaway-cost protection. Both must be zero-overhead when disabled.

## Scope
- LangSmith: native env passthrough (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`) — no code coupling; optional Langfuse callback handler registered only when `LANGFUSE_*` set
- Per-call metadata: usage tag (parsing/analysis-step), analysis id, prompt version
- Cost guards: input caps (JD ≤50k, resume text ≤200k — enforced upstream, re-checked here), `max_tokens` per step from config, per-user concurrent analyses limit (`LLM_USER_CONCURRENCY`, default 2) → 429 envelope when exceeded
- Token usage persisted on analysis (`tokensUsed` rollup) and on uploadParse; surfaced via API

## Acceptance criteria
- [ ] All observability flags off → zero extra network calls (nock-style assertion), zero added latency (benchmark sanity)
- [ ] With Langfuse mock: spans received per step with correct metadata
- [ ] 3rd concurrent analysis for one user → 429 with clear message; other users unaffected
- [ ] Token usage visible in `GET /analyses/:id` response and Swagger example
- [ ] `max_tokens` honored per step (asserted via fake provider call args)

## Dependencies
Blocked by {{4.2}}, {{4.5}}.
@@END

@@ISSUE
key: 4.8
title: 4.8 — AI platform consolidated tests + real-provider smoke
labels: type:task, phase:4, area:server, priority:P0
milestone: M4
parent: E4
---
Part of {{E4}}.

## Context
Phase gate for the most failure-prone subsystem: everything proven against the fake provider, plus one recorded manual smoke against real OpenAI before the phase closes.

## Scope
- Consolidate unit+e2e for 4.1–4.7: full upload→parse and analyze→result lifecycles, crash/retry/drain paths, registry resolution, guard limits
- Manual smoke checklist (documented in epic): real `OPENAI_API_KEY`, 1 real resume parse + 1 real analysis; record model, duration, token usage, output sanity
- **Needs from Adi:** `OPENAI_API_KEY` for the smoke run

## Acceptance criteria
- [ ] Coverage ≥80% on `ai/`, `jobs/`, `analyses/`
- [ ] Lifecycle e2e suites stable across 10 CI runs (no flake)
- [ ] Real-provider smoke executed once; results + any prompt adjustments recorded in this epic before close
- [ ] Every PROMPT.md analysis requirement traced to a test (list in PR)

## Dependencies
Blocked by {{4.1}}, {{4.2}}, {{4.3}}, {{4.4}}, {{4.5}}, {{4.6}}, {{4.7}}.
@@END

@@ISSUE
key: E5
title: [EPIC] Phase 5 — Notifications & Realtime (SSE)
labels: type:epic, phase:5, area:server
milestone: M5
---
## Phase goal
The bell-notification system (one active notification per analysis, visit/manual clearing, TTL) and SSE streams for analysis progress and notifications — heartbeat-kept-alive, cookie-authenticated, with the REST polling fallback contract documented.

## Exit criteria (phase gate)
- [ ] Notification lifecycle rules from PROMPT.md enforced and race-proven
- [ ] SSE delivers step transitions < 1s after they occur; reconnect replays current state
- [ ] Polling fallback returns identical data shapes
- [ ] SSE tests flake-free across 10 CI runs

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P5), §10 E5, D14; schema: `notifications`.
@@END

@@ISSUE
key: 5.1
title: 5.1 — Notifications module (single-active-per-analysis lifecycle)
labels: type:task, phase:5, area:server, priority:P0
milestone: M5
parent: E5
---
Part of {{E5}}.

## Context
PROMPT.md: a nav-bar notification persists while analysis runs, switches to completion, and clears when the user visits the details page or clears it manually. The schema enforces one ACTIVE notification per analysis via a unique partial index.

## Scope
- Triggered by analysis lifecycle ({{4.5}}): start → upsert `analysis_in_progress`; complete/fail → **replace in place** with `analysis_completed`/`analysis_failed` (same active slot, honoring the unique partial index race-safely)
- `GET /api/v1/notifications` (active, newest first, paginated) · `POST /api/v1/notifications/:id/clear` (manual)
- Auto-clear on `GET /analyses/:id` (visit rule — hooked in {{4.6}})
- 30-day TTL via `expiresAt`

## Acceptance criteria
- [ ] Lifecycle e2e: start → in-progress bell; completion → replaced (same analysis, one active row); visit details → cleared; manual clear → cleared
- [ ] Race: simultaneous progress/complete upserts never violate the unique index (parallel test, retry-on-conflict logic proven)
- [ ] Cleared notifications excluded from the bell query; TTL index present
- [ ] Foreign user's notification → 404 on clear

## Dependencies
Blocked by {{4.5}}, {{4.6}}.
@@END

@@ISSUE
key: 5.2
title: 5.2 — SSE streams: analysis progress + notification bell
labels: type:task, phase:5, area:server, priority:P0
milestone: M5
parent: E5
---
Part of {{E5}}.

## Context
Live progress UX (approved D14). Must survive proxies (Railway) and reconnects without losing state.

## Scope
- `GET /api/v1/analyses/:id/events`: emits current snapshot on connect, then step transitions + terminal event; closes after terminal
- `GET /api/v1/notifications/events`: bell-state changes for the user
- Cookie-authenticated (same guards), ownership-checked; 15s heartbeat comments; `Last-Event-ID` support → resend current snapshot; per-user connection cap (default 5) → 429
- Proxy-friendly: `Cache-Control: no-cache`, `X-Accel-Buffering: no`, compression disabled on stream; internal event bus bridges job-runner events ({{4.4}}/{{4.5}}) to streams
- Polling fallback documented: same DTOs via `GET /analyses/:id` and `GET /notifications`

## Acceptance criteria
- [ ] Integration: client receives pending→in_progress→completed within 1s of each transition; stream closes after terminal event
- [ ] Reconnect mid-analysis (with/without Last-Event-ID) → current snapshot first, no missed terminal state
- [ ] Unauthenticated → 401; foreign analysis → 404; 6th concurrent stream → 429
- [ ] Heartbeats observed at ≤15s intervals on an idle stream
- [ ] Response headers exactly as specified (asserted)

## Dependencies
Blocked by {{5.1}}, {{2.2}}.
@@END

@@ISSUE
key: 5.3
title: 5.3 — Realtime consolidated tests (flake-proofing)
labels: type:task, phase:5, area:server, priority:P1
milestone: M5
parent: E5
---
Part of {{E5}}.

## Context
SSE tests are notorious flake sources; the phase closes only when they're deterministic.

## Scope
- Consolidated SSE + notification integration suite with deterministic event ordering (fake provider + controlled job runner)
- 10-run CI stability check; timeout hygiene (no dangling sockets/handles — jest open-handle detection clean)

## Acceptance criteria
- [ ] Suite green 10/10 consecutive CI runs
- [ ] No open-handle warnings; suite runtime < 60s
- [ ] Polling-fallback contract test: SSE payloads and REST DTOs structurally identical (schema-compared)

## Dependencies
Blocked by {{5.1}}, {{5.2}}.
@@END

@@ISSUE
key: E6
title: [EPIC] Phase 6 — Admin Domain
labels: type:epic, phase:6, area:server
milestone: M6
---
## Phase goal
The complete admin backend under `/api/v1/admin/**` (role-guarded): platform stats, user management (search/edit/deactivate/password-reset), privacy-bounded resume administration (metadata only — admins can never read resume/analysis content), and AI model settings. Every action audited.

## Exit criteria (phase gate)
- [ ] RBAC denial matrix green (anon/candidate/deactivated × every admin route)
- [ ] DTO-proven: no admin endpoint can return resume or analysis content
- [ ] Every admin mutation writes an audit row
- [ ] `security-review` skill run on the phase diff; coverage ≥85% on `admin/`

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · every new/changed endpoint ships exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P6), §10 E6; PROMPT.md Admin section; schemas: `auditlogs`, `aimodels`.
@@END

@@ISSUE
key: 6.1
title: 6.1 — Admin dashboard stats endpoint
labels: type:task, phase:6, area:server, priority:P0
milestone: M6
parent: E6
---
Part of {{E6}}.

## Context
PROMPT.md admin dashboard: registered users, resumes (created + uploaded combined), analyses run.

## Scope
- `GET /api/v1/admin/stats` → `{ users, resumes, analyses }` (live docs only for resumes; all-time counts)
- Efficient `countDocuments` with 60s in-memory cache (config-tunable); admin role guard ({{2.3}})

## Acceptance criteria
- [ ] Numbers correct against seeded fixtures (incl. soft-deleted resumes excluded)
- [ ] Candidate → 403; anonymous → 401
- [ ] <200ms with 10k-doc fixtures (memory-server benchmark)
- [ ] Cache: second call within window hits cache (asserted), invalidation window honored

## Dependencies
Blocked by {{2.3}}, {{3.2}}, {{4.5}}.
@@END

@@ISSUE
key: 6.2
title: 6.2 — Admin user management (search, edit, deactivate, password reset)
labels: type:task, phase:6, area:server, priority:P0
milestone: M6
parent: E6
---
Part of {{E6}}.

## Context
PROMPT.md user-list and user-details features, with the safety rails production demands (no self-lockout, immediate deactivation effect, full audit).

## Scope
- `GET /api/v1/admin/users`: search by id (exact), email/name (text+prefix via {{1.3}} indexes); columns fullName, email, createdAt (registration), lastActiveAt, resumeCount, analysisCount; pagination + sort
- `GET /api/v1/admin/users/:id` (profile + status + counters; no secrets) · `PATCH` (fullName, email w/ case-insensitive uniqueness → 409)
- `POST /api/v1/admin/users/:id/reset-password`: two modes — set temporary password (returned once, force-change flag) OR send reset mail ({{2.5}}); both audited (`admin.user.password_reset`)
- `POST …/deactivate` / `…/reactivate`: deactivation revokes all refresh tokens; self-deactivation and self-demotion blocked → 409
- Audit on every mutation (`admin.user.update`, `admin.user.deactivate`, …) with actor, target, redacted diff

## Acceptance criteria
- [ ] Search by each criterion (id/email/name) returns expected rows; pagination/sort contract tested
- [ ] Email collision → 409; deactivated user's existing access token 403s on next request ({{2.3}} ActiveUserGuard) and refresh is revoked
- [ ] Self-deactivation/demotion blocked (e2e as the admin)
- [ ] Both password-reset modes work; temp password is argon2id-hashed, returned exactly once, never logged
- [ ] Every mutation produces an audit row (table-driven assertion)

## Dependencies
Blocked by {{2.3}}, {{2.5}}, {{6.1}}.
@@END

@@ISSUE
key: 6.3
title: 6.3 — Privacy-bounded resume administration + cascade delete
labels: type:task, phase:6, area:server, priority:P0
milestone: M6
parent: E6
---
Part of {{E6}}.

## Context
PROMPT.md is explicit: admins see a user's resume **list** (name, analysis count) but must NOT view resume/analysis content; admins CAN delete resumes with their analyses. The privacy boundary must be structural (DTO whitelist), not convention.

## Scope
- `GET /api/v1/admin/users/:id/resumes`: metadata-only DTO — name, source, createdAt, analysisCount, analysisStatus. **No `jsonResume`, no `originalText`, no analysis results anywhere in the admin API surface**
- `DELETE /api/v1/admin/resumes/:id`: soft-delete resume → cascade soft-delete its analyses → clear their active notifications → decrement user counters; ordered idempotent steps (D15 — re-runnable, no transactions); audit `admin.resume.delete`
- Candidate content routes (`GET /resumes/:id` etc.) remain candidate-scoped: admins hitting them for foreign resumes get 403/404 (role-scoping test)

## Acceptance criteria
- [ ] DTO whitelist test: serialized admin resume listing contains exactly the allowed fields (schema-asserted, fails on accidental additions)
- [ ] Admin requesting candidate resume-content endpoints → no content access (denial test)
- [ ] Cascade verified: analyses soft-deleted, notifications cleared, counters decremented; survives partial-failure re-run (idempotency test: kill between steps, re-run completes)
- [ ] Deleted user data excluded from candidate dashboard and admin lists alike
- [ ] Audit row contains target ids but never content fields

## Dependencies
Blocked by {{6.2}}, {{4.6}}, {{5.1}}.
@@END

@@ISSUE
key: 6.4
title: 6.4 — Admin AI model settings endpoints (masked keys, live validation)
labels: type:task, phase:6, area:server, priority:P0
milestone: M6
parent: E6
---
Part of {{E6}}.

## Context
PROMPT.md Settings: list models with masked keys, add models with API keys. HTTP surface over {{4.1}} with operational safety rails.

## Scope
- `GET /api/v1/admin/models`: masked (`provider`, `modelName`, `••••last4`, status, usages, lastUsedAt)
- `POST /api/v1/admin/models`: validates key with a live 1-token ping against the provider before saving (fake-provider hook for tests); encrypts via {{4.1}}
- `PATCH /api/v1/admin/models/:id`: status (active/disabled), usages
- `POST /api/v1/admin/models/:id/rotate-key`: re-validate + re-encrypt + update last4
- `DELETE /api/v1/admin/models/:id`: blocked (409) if it's the only active model for any usage **and** no env fallback exists
- Audits: `admin.model.add` / `remove` / `key_rotate`

## Acceptance criteria
- [ ] Invalid key rejected at create with provider error surfaced (mocked); nothing persisted
- [ ] Masked output everywhere — list, detail, Swagger examples, audit meta (no raw key anywhere; regression test)
- [ ] Delete-last-active-model guard: 409 when no fallback; allowed when env fallback present
- [ ] Rotation: old key unusable, new last4 visible, resolution ({{4.1}}) picks up the new key without restart
- [ ] Denial matrix: candidate → 403 on all model routes

## Dependencies
Blocked by {{4.1}}, {{2.3}}.
@@END

@@ISSUE
key: 6.5
title: 6.5 — Admin consolidated tests + RBAC matrix + security review
labels: type:task, phase:6, area:server, priority:P0
milestone: M6
parent: E6
---
Part of {{E6}}.

## Context
Phase gate: admin surface is privileged; it closes with a full denial matrix, audit assertions, and a security pass.

## Scope
- Table-driven RBAC matrix: {anonymous, candidate, deactivated-admin, admin} × every admin route → expected status
- Audit completeness sweep: every admin mutation asserted to write its row
- Run `security-review` skill on the phase diff; fix or ticket findings

## Acceptance criteria
- [ ] Matrix fully green; added routes automatically covered (matrix driven by route introspection)
- [ ] Coverage ≥85% on `admin/`; audit sweep green
- [ ] Security review done; zero open high/critical findings
- [ ] Every PROMPT.md admin requirement traced to a test (list in PR)

## Dependencies
Blocked by {{6.1}}, {{6.2}}, {{6.3}}, {{6.4}}.
@@END

@@ISSUE
key: E7
title: [EPIC] Phase 7 — Frontend Foundation
labels: type:epic, phase:7, area:client
milestone: M7
---
## Phase goal
The React application shell every feature screen plugs into: Vite+TS scaffold, the Tailwind design system extracted from the mockup (light/dark, Pinecone-like), routing with role guards, the API client with single-flight token refresh, TanStack Query setup, forms infrastructure bound to the shared zod schemas, and the frontend test harness.

## Exit criteria (phase gate)
- [ ] App shell renders with theming + auth-guarded routing against the real API
- [ ] MSW-backed test suite green in CI
- [ ] UI kit passes axe checks; theme toggle persists; AA contrast in both themes

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs updated when conventions change · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N`.

## References
PLAN.md §8 (P7), §10 E7; `cvantage-mockup.html`; PROMPT.md Instructions (responsive, themes, a11y, web vitals).
@@END

@@ISSUE
key: 7.1
title: 7.1 — Vite + React + TypeScript scaffold (frontend/)
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
Per CLAUDE.md: react+typescript+vite in `frontend/`. Dev mode proxies `/api` to the NestJS server; prod build is served by the server ({{10.1}}).

## Scope
- Vite 6 + React 19, strict tsconfig matching server flags, path aliases (`@/…`)
- Env handling: `VITE_*` only, typed accessor module, `.env.example` entries
- Dev proxy `/api → http://localhost:3000`; `yarn dev` / `yarn build` / `yarn preview`
- Folder layout per PLAN.md §7.1 (`app/`, `api/`, `components/ui/`, `features/*`, `hooks/`, `lib/`, `styles/`, `test/`)

## Acceptance criteria
- [ ] `yarn dev` serves with HMR; `/api/v1/health/live` reachable through the proxy against a running server
- [ ] `yarn build` emits hashed assets to `frontend/dist`; `yarn preview` serves it
- [ ] Typecheck clean under strict flags; aliases work in build + tests + IDE
- [ ] No `process.env` usage; only typed `import.meta.env` accessor

## Dependencies
Blocked by {{0.1}}, {{0.2}}.
@@END

@@ISSUE
key: 7.2
title: 7.2 — Design system: Tailwind tokens from mockup, dark/light, UI kit
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
`cvantage-mockup.html` defines the visual language (Pinecone-like, light+dark). Extracting it into tokens + a reusable kit keeps every screen consistent and accessible.

## Scope
- Tailwind v4 theme tokens extracted from the mockup: palette (both themes), radii, spacing, type scale, shadows
- Theming: `class` strategy, system-preference default, persisted toggle, **no FOUC** (inline pre-hydration script)
- UI kit (keyboard-accessible, visible focus, aria-correct): Button, Input, Textarea, Select, Checkbox, DatePartInput (YYYY / YYYY-MM / YYYY-MM-DD), Modal, Drawer, Table (sortable header), Badge (status color variants), Tabs, Tooltip, Toast system, Skeleton, Spinner, EmptyState, ProgressSteps, ConfirmDialog
- Dev-only `/showcase` route rendering the kit in both themes

## Acceptance criteria
- [ ] Showcase route renders all components in both themes; axe reports zero serious/critical on it
- [ ] Theme toggle persists across reload; honors system preference on first visit; no flash (verified with throttled reload)
- [ ] AA contrast for text/interactive states in both themes (tooling-checked)
- [ ] DatePartInput accepts/validates the three partial formats (component tests)
- [ ] Every kit component keyboard-operable (focus, Enter/Space/Escape semantics tested)

## Dependencies
Blocked by {{7.1}}.
@@END

@@ISSUE
key: 7.3
title: 7.3 — Routing, layouts & role guards
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
Three navigation worlds (public marketing, candidate app, admin) with guards driven by auth state, plus the 404/403 pages PROMPT.md's SPA correctness implies.

## Scope
- React Router: route tree with layouts — marketing (landing/auth), app shell (top nav + bell + user menu), admin shell (admin nav per PROMPT.md)
- Guards: `RequireAuth`, `RequireRole(admin)`, `RedirectIfAuthed` (login/register); deep-link preservation (post-login return-to)
- Route-level code splitting with suspense skeletons; per-route document titles; scroll restoration; 404 page (and 403 for role denials)

## Acceptance criteria
- [ ] Logged-out deep link to a guarded route → login → returns to the original target (e2e-style test)
- [ ] Candidate visiting `/admin/**` → 403 page; admin sees admin shell
- [ ] Lazy chunks visible in build output (separate files per feature area)
- [ ] Unknown route → 404 page; document titles update per route

## Dependencies
Blocked by {{7.1}}, {{7.2}}.
@@END

@@ISSUE
key: 7.4
title: 7.4 — API client & TanStack Query layer (single-flight refresh)
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
Every screen talks to the API through this layer. The refresh-rotation contract ({{2.2}}) demands exactly one refresh under concurrent 401s.

## Scope
- Axios instance (`withCredentials`); response interceptor: on 401 → single-flight `POST /auth/refresh` → replay queued requests; refresh failure → clear auth state + redirect to login
- Error normalization to the shared envelope type; toast-friendly error mapper (422 field errors stay with forms)
- TanStack Query v5: QueryClient defaults (staleTime, retry: skip 4xx, focus refetch policy), typed endpoint functions per domain, query-key factory, devtools in dev
- Auth context: `me` query, login/register/logout mutations, role exposure for guards ({{7.3}})

## Acceptance criteria
- [ ] MSW test: 3 parallel 401s → exactly one refresh call → all 3 replayed successfully
- [ ] Refresh failure → logged out, redirected, query cache cleared
- [ ] 422 envelope surfaces field errors (typed) without toasting; 500 toasts generic message with requestId
- [ ] Query keys collision-free across domains (factory unit tests)
- [ ] No token handling in JS beyond cookies (httpOnly respected — no localStorage)

## Dependencies
Blocked by {{7.1}}; contract from {{2.2}}, {{1.5}}.
@@END

@@ISSUE
key: 7.5
title: 7.5 — Forms infrastructure (react-hook-form + shared zod)
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
The resume editor is a giant dynamic form; auth/admin forms are smaller ones. One accessible form system, validated by the same zod schemas the server uses ({{3.1}}).

## Scope
- react-hook-form + zodResolver wired to `@cvantage/shared` schemas
- Field primitives binding the UI kit: label, description, error message, `aria-invalid`/`aria-describedby`, required markers
- Array-field helpers: add/remove/reorder with stable keys + focus management (for work/education/skills/… sections)
- Dirty-state navigation guard (router blocker + confirm dialog); submit helpers mapping server 422 details back onto fields

## Acceptance criteria
- [ ] Invalid submit focuses first errored field; errors announced (aria-live) — RTL tests
- [ ] Array add/remove/reorder round-trips values correctly and keeps focus sane
- [ ] Server 422 (`work[0].startDate`) lands on the exact field
- [ ] Leaving a dirty form prompts; clean form doesn't
- [ ] Date fields validate the three partial formats client-side identically to server (shared schema test)

## Dependencies
Blocked by {{7.2}}, {{7.4}}, {{3.1}}.
@@END

@@ISSUE
key: 7.6
title: 7.6 — Frontend test harness (vitest, RTL, MSW)
labels: type:task, phase:7, area:client, priority:P0
milestone: M7
parent: E7
---
Part of {{E7}}.

## Context
Every later client issue tests against this harness; MSW handlers double as the API contract reference and are reused as fixtures for Playwright ({{10.6}}).

## Scope
- Vitest + RTL + jsdom; jest-dom matchers; user-event
- MSW: handler set per domain (auth, users, resumes, analyses, notifications, admin) built from shared DTO types + fixtures ({{3.1}} sample resume, full analysis result)
- Render helpers (providers: router, query, theme, auth states: anon/candidate/admin)
- Coverage thresholds ≥80% on `api/`, `lib/`, `components/ui/`; wired to CI ({{0.6}}) and pre-commit related tests ({{0.3}})

## Acceptance criteria
- [ ] Example component/hook/api tests green in CI < 2 min
- [ ] MSW handlers type-check against shared DTOs (drift = compile error)
- [ ] Render helper boots a screen in all three auth states with one line each
- [ ] Coverage gate demonstrated red→green

## Dependencies
Blocked by {{7.1}}, {{7.4}}.
@@END

@@ISSUE
key: E8
title: [EPIC] Phase 8 — Frontend Candidate Experience
labels: type:epic, phase:8, area:client
milestone: M8
---
## Phase goal
Every candidate-facing PROMPT.md feature, usable end-to-end against the real backend (fake LLM acceptable): landing, auth screens, dashboard, upload flow with parse progress, the full json-resume editor, in-place editing, the upload-review split screen, and the complete analysis journey (start → live progress + bell → results → apply suggestions).

## Exit criteria (phase gate)
- [ ] Each candidate feature from PROMPT.md demonstrated working end-to-end
- [ ] Live status updates flow through SSE with polling fallback
- [ ] Feature-folder coverage ≥80%; all screens responsive + both themes

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · screens responsive (360px→4k) in both themes with keyboard access.

## References
PLAN.md §8 (P8), §10 E8; PROMPT.md Candidate features; `cvantage-mockup.html` (`scr-resume-view`, `scr-upload-review`).
@@END

@@ISSUE
key: 8.1
title: 8.1 — Landing page (hero, features, CTA)
labels: type:task, phase:8, area:client, priority:P1
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: impactful landing with the product name and description. CVantage = "CV + vantage point" — the tagline/description ship here.

## Scope
- Marketing layout: hero (name, tagline, primary CTA → register, secondary → login), feature highlights (AI parsing, JD analysis, suggestions, interview prep), how-it-works strip, footer
- Fully responsive; both themes; Pinecone-like visual language from the mockup; SEO meta + OG tags

## Acceptance criteria
- [ ] Lighthouse on the page: performance ≥90, accessibility ≥90, SEO ≥90 (lab, desktop+mobile presets)
- [ ] Renders correctly 360px→4k, portrait+landscape (responsive QA notes in PR)
- [ ] CTAs route correctly for anon vs authed users (authed → dashboard)
- [ ] Images optimized (modern formats, lazy below fold); no CLS from hero

## Dependencies
Blocked by {{7.2}}, {{7.3}}.
@@END

@@ISSUE
key: 8.2
title: 8.2 — Auth screens (login, register, OAuth buttons, reset, verify)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
Client side of Phase 2: one login flow for everyone, OAuth buttons appearing only when the backend says the provider is enabled (D4).

## Scope
- Login, Register (password strength meter mirroring server policy), Forgot-password, Reset-password (token from link), Email-verification result states
- OAuth buttons rendered from `GET /auth/providers` (hidden when disabled); provider redirect handling incl. error returns
- Server-error mapping: 409 email exists (inline), 401 generic creds error, 429 lockout with retry-after countdown, deactivated-account message
- Post-login routing: candidate → dashboard, admin → admin dashboard; return-to honored ({{7.3}})

## Acceptance criteria
- [ ] Full flows green against the real API in dev + MSW component tests for every state listed
- [ ] OAuth buttons: none with flags off; per-provider with flags on (MSW-driven)
- [ ] Lockout (429) shows countdown and re-enables; field errors map inline (422)
- [ ] Forms fully keyboard-operable; password manager friendly (autocomplete attrs)

## Dependencies
Blocked by {{7.4}}, {{7.5}}; API from {{2.1}}, {{2.4}}, {{2.5}}.
@@END

@@ISSUE
key: 8.3
title: 8.3 — Candidate dashboard (stats, resume table, entry points)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md dashboard: counters, the resume table with exact columns/actions, and the create/upload entry points. The hub of the app.

## Scope
- Stats cards (resumes created, analyses run) from `GET /users/me/stats`
- Resume table: name, upload date, last analysis date, status badge (unanalyzed / in progress / completed / failed), actions **Analyze · Edit · Delete** (delete → ConfirmDialog); server-driven pagination/sort; skeleton + empty state for new users
- Entry points: Create Resume → editor ({{8.5}}); Upload Resume → upload flow ({{8.4}})
- Live updates: SSE notification events ({{5.2}}) invalidate resume/stats queries so status badges flip without refresh

## Acceptance criteria
- [ ] Table matches PROMPT.md columns exactly; sort/pagination round-trips server contract
- [ ] Delete: confirm → optimistic row removal → rollback + toast on API error (MSW-forced)
- [ ] Status badge flips unanalyzed→in progress→completed during a live analysis (integration test with mocked SSE)
- [ ] Empty state renders for fresh accounts with working CTAs
- [ ] Analyze action navigates with the resume preselected ({{8.8}})

## Dependencies
Blocked by {{7.3}}, {{7.4}}; API from {{3.2}}, {{3.3}}.
@@END

@@ISSUE
key: 8.4
title: 8.4 — Upload flow (dropzone, upload progress, AI parse progress)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: drag/drop + file selection (.pdf/.doc/.docx only), clear "AI is processing" progress, then land on the edit screen.

## Scope
- Dropzone (drag/drop + picker): client-side pre-checks (extension/MIME/≤10MB) with friendly inline errors; single file
- Upload phase: XHR progress bar; cancel
- Parse phase: distinct state ("AI is processing your resume…") driven by SSE parse events ({{4.4}}/{{5.2}}) with polling fallback; long-parse reassurance message at >30s; failure state with Retry (reparse endpoint)
- Success → navigate to upload-review screen ({{8.7}})

## Acceptance criteria
- [ ] Wrong type/oversize rejected client-side with message (server still re-validates — MSW 422 path also rendered)
- [ ] Upload and parse phases visually distinct; progress events advance the UI (mocked SSE test)
- [ ] Server killed mid-parse (MSW failure event) → failure state; Retry triggers reparse and recovers
- [ ] Cancel during upload aborts the request and resets the dropzone
- [ ] Full e2e against real backend with fake LLM: drop fixture file → review screen

## Dependencies
Blocked by {{7.4}}; API from {{3.5}}, {{4.4}}, {{5.2}}.
@@END

@@ISSUE
key: 8.5
title: 8.5 — Resume editor: full json-resume form (every field editable)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: a form following the json-resume schema where **ALL** fields are editable (including dates), placeholders shown for missing fields but never persisted.

## Scope
- All 12 sections + meta: basics (+location, profiles[]), work[], volunteer[], education[], awards[], certificates[], publications[], skills[] (+keywords), languages[], interests[], references[], projects[] — dynamic arrays with add/remove/reorder ({{7.5}} helpers)
- Appropriate control per field type: DatePartInput for partial dates, URL/email inputs, textareas for summaries/highlights, tag-input for keyword arrays
- Placeholders for missing fields; `pruneEmpty` ({{3.1}}) applied before submit — **placeholder-only fields never sent**
- Section navigation (sticky sidebar/tabs), per-field zod validation, save → `POST /resumes` → resume view ({{8.6}})

## Acceptance criteria
- [ ] Submitting a section containing only placeholders stores nothing for it (verified against API/DB in integration test)
- [ ] All 12 sections round-trip: fill → save → reload → identical values
- [ ] Date inputs accept the 3 partial formats, reject invalid (client mirrors server: same shared schema)
- [ ] Full form completable via keyboard only; section nav announces position (a11y test)
- [ ] Validation errors from server 422 map to exact fields ({{7.5}})

## Dependencies
Blocked by {{7.5}}; API from {{3.2}}.
@@END

@@ISSUE
key: 8.6
title: 8.6 — Resume view with per-field in-place editing (pencil affordance)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: formatted resume; hovering any field shows a pencil; clicking enables editing for that field alone. Same view serves the edit-from-list flow.

## Scope
- Formatted resume render per mockup `scr-resume-view` (all sections, print-quality typography)
- Hover/focus pencil on every field; click/Enter → that field swaps to its editor (correct control incl. arrays/dates) with inline Save/Cancel
- Save: PATCH only the changed path with optimistic update; version conflict (409) → toast with Reload action ({{3.2}} concurrency)
- "Analyze Resume" button → analysis start ({{8.8}}); entry from dashboard Edit action lands here

## Acceptance criteria
- [ ] Every rendered field is individually editable and persists (table-driven test over field types: scalar, date, array item, nested)
- [ ] Optimistic update + rollback on failure; 409 path shows conflict toast and refreshes cleanly
- [ ] Pencil reachable by keyboard (focusable, Enter activates, Escape cancels) and announced to screen readers
- [ ] Unsaved in-place edit warns before navigation (dirty guard)
- [ ] Renders correctly in both themes incl. long-content resumes (overflow handling)

## Dependencies
Blocked by {{8.5}}; API from {{3.2}}.
@@END

@@ISSUE
key: 8.7
title: 8.7 — Upload review screen (form left, original text right)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: after AI parsing, user corrects the structured resume with the extracted original text beside it, then saves and can start analysis. Mockup `scr-upload-review`.

## Scope
- Split view: left = editor ({{8.5}} component) populated with parsed `jsonResume`; right = scrollable read-only `originalText` panel (monospaced, searchable via browser)
- Independent scroll; responsive collapse to tabs under `lg`
- Save → PATCH; then "Start Analysis" CTA appears/enables → {{8.8}} with resume preselected
- Parse-failure entry state (came here with failed parse) → message + retry hook back to {{8.4}}

## Acceptance criteria
- [ ] Parsed fixture populates the form; original text renders beside it (e2e with fake LLM)
- [ ] Panels scroll independently; tab collapse works at small widths (responsive test notes)
- [ ] Save then Start Analysis navigates with the correct resume preselected
- [ ] Editing works identically to {{8.5}} (shared component — no fork)

## Dependencies
Blocked by {{8.4}}, {{8.5}}.
@@END

@@ISSUE
key: 8.8
title: 8.8 — Analysis start screen (JD + name, clear/start, preselected resume)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md is precise here: reachable only with a resume; the resume the user navigated from is the one analyzed; two buttons — Clear and Start Analysis.

## Scope
- Route `/resumes/:id/analyze` (guard: resume must exist & belong to user — else redirect to dashboard with toast)
- Context header showing the selected resume (name, updated date)
- Analysis-name input + JD textarea with live char counter against 30–50k bounds; zod validation
- **Clear** (wipes both fields, stays) · **Start Analysis** (disabled until valid) → `POST /analyses` → progress screen ({{8.9}})

## Acceptance criteria
- [ ] Direct URL without valid resume → redirected with explanation
- [ ] Resume context survives refresh (route param drives it)
- [ ] Counter + validation messages at both bounds; Start disabled until valid
- [ ] Clear resets exactly the two fields (resume selection untouched)
- [ ] Create call errors (422/429 concurrency cap from {{4.7}}) surfaced inline

## Dependencies
Blocked by {{7.5}}; API from {{4.5}}, {{4.7}}.
@@END

@@ISSUE
key: 8.9
title: 8.9 — Analysis progress screen + persistent bell notification
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
The PROMPT.md realtime showpiece: 3 color-coded steps, a nav-bar notification that persists across navigation, completion cue, and the two clearing rules.

## Scope
- Progress screen: the 3 steps (Comparing resume & JD / Generating Suggestions / Preparing Interview Questions) with pending/in-progress/completed/failed states (ProgressSteps kit, mockup colors), driven by `GET /analyses/:id/events` SSE with TanStack polling fallback
- Bell (app shell, {{7.3}}): active notifications from `GET /notifications` + `/notifications/events` SSE; in-progress entry persists across navigation; click → progress screen (or results if terminal)
- Completion: visual cue (toast + bell state change); notification cleared on visiting analysis details or manual clear (server rules {{5.1}} — client reflects)
- Failure: error panel + Retry button (retry endpoint) restarting the stream

## Acceptance criteria
- [ ] Full lifecycle e2e (fake LLM): steps animate pending→in_progress→completed; completion toast fires
- [ ] Navigate away mid-analysis and back via bell → progress resumes from current state (SSE reconnect snapshot)
- [ ] Notification persists across navigation until visit/manual clear; both clearing rules verified
- [ ] SSE drop (MSW abort) → polling fallback keeps progressing (test)
- [ ] Failed step renders error + working Retry; bell shows failure state

## Dependencies
Blocked by {{8.8}}; API from {{5.1}}, {{5.2}}, {{4.6}}.
@@END

@@ISSUE
key: 8.10
title: 8.10 — Analysis results screen (scores, insights, suggestions, Q&A)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md results layout: scores, strong/weak points, skills match/gaps, grouped improvement suggestions, interview Q&A, and the CTA into apply-suggestions.

## Scope
- Score gauges: overall + ATS (+ project score when present), 0–100 with color bands
- Strong/weak points lists; matching skills vs skill gaps as chip groups
- Improvement suggestions grouped by category/field (ATS, skill emphasis, wording, skill additions, project) with proposedValue previews
- Interview Q&A accordion (question → suggested answer)
- "Apply suggestions to the resume" button → {{8.11}}; deep-linkable (bell click-through target); print-friendly stylesheet

## Acceptance criteria
- [ ] Full fake-provider fixture renders every section faithfully (snapshot + RTL)
- [ ] Empty arrays render graceful empty states (no broken sections)
- [ ] Deep link straight to results works (and clears the notification per {{5.1}})
- [ ] Accordion keyboard-accessible; gauges have text alternatives (a11y)
- [ ] Print stylesheet produces a clean one-pager (manual check noted in PR)

## Dependencies
Blocked by {{8.9}}; API from {{4.6}}.
@@END

@@ISSUE
key: 8.11
title: 8.11 — Apply-suggestions screen (split view, per-suggestion apply, download)
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
PROMPT.md: current resume left, suggestions right, apply individually per field, save, and a Download dropdown (PDF/DOCX).

## Scope
- Split view: left = resume render ({{8.6}} component, live document); right = suggestion cards grouped by category, each with target-field path, description, proposedValue, **Apply** / **Dismiss**
- Hovering a suggestion highlights its target field in the left pane (fieldRef → anchor map)
- Apply → {{4.6}} endpoint → left pane updates (query invalidation), card flips to applied (timestamp); Dismiss likewise; both reflected on reload
- Save confirmation summarizing applied changes; **Download dropdown (PDF / DOCX)** → export endpoints — ships disabled-with-tooltip until {{9.4}} merges, flips on automatically after
- Conflict path: resume edited elsewhere → 409 toast with refresh action

## Acceptance criteria
- [ ] Applying a suggestion visibly mutates exactly the targeted field in the left pane (array and scalar cases tested)
- [ ] Applied/dismissed states persist across reload; re-apply is a no-op
- [ ] Hover-highlight pairs card and field (and is keyboard-triggerable)
- [ ] Download dropdown downloads valid files once {{9.4}} lands (integration verified then); disabled state + tooltip before
- [ ] 409 conflict path renders recovery UX

## Dependencies
Blocked by {{8.10}}; API from {{4.6}}, later {{9.4}}.
@@END

@@ISSUE
key: 8.12
title: 8.12 — Candidate experience consolidated test suite
labels: type:task, phase:8, area:client, priority:P0
milestone: M8
parent: E8
---
Part of {{E8}}.

## Context
Phase gate: the candidate journey is the product; its logic gets locked in before admin/export and hardening phases build on top.

## Scope
- RTL+MSW consolidation over 8.2–8.11 critical logic: editor pruning, in-place edit state machine, SSE hook (reconnect/fallback), apply flow, auth flows
- One full-journey integration spec against MSW: register → create resume → analyze → results → apply
- Coverage report per feature folder in CI summary

## Acceptance criteria
- [ ] Coverage ≥80% on `features/*` (per-folder, not just aggregate)
- [ ] Full-journey spec green and < 60s
- [ ] Every PROMPT.md candidate requirement traced to a test (list in PR)
- [ ] Zero `act()`/async warnings in test output

## Dependencies
Blocked by {{8.2}}, {{8.3}}, {{8.4}}, {{8.5}}, {{8.6}}, {{8.7}}, {{8.8}}, {{8.9}}, {{8.10}}, {{8.11}}.
@@END

@@ISSUE
key: E9
title: [EPIC] Phase 9 — Frontend Admin + Resume Export
labels: type:epic, phase:9, area:client
milestone: M9
---
## Phase goal
The admin UI (dashboard, user management, AI model settings) over the Phase 6 APIs, plus the server-side PDF/DOCX export service wired into the candidate download dropdown.

## Exit criteria (phase gate)
- [ ] All PROMPT.md admin journeys usable end-to-end
- [ ] Exported PDF and DOCX open correctly with all sections of a full resume
- [ ] No resume content rendered anywhere in admin screens (metadata only)

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · server endpoints ship exhaustive Swagger annotations with examples (per {{1.9}}).

## References
PLAN.md §8 (P9), §10 E9; PROMPT.md Admin section + download dropdown.
@@END

@@ISSUE
key: 9.1
title: 9.1 — Admin navigation & dashboard
labels: type:task, phase:9, area:client, priority:P0
milestone: M9
parent: E9
---
Part of {{E9}}.

## Context
PROMPT.md: top navigation bar for admin features + dashboard summarizing users, resumes, analyses.

## Scope
- Admin shell nav ({{7.3}}): Dashboard · Users · Settings; active states; admin user menu
- Dashboard cards from `GET /admin/stats` (users registered, resumes created+uploaded, analyses run) with loading/error states

## Acceptance criteria
- [ ] Admin login lands on admin dashboard; candidate blocked by guard (403 page) — both tested
- [ ] Card numbers match the stats endpoint (MSW + one real-API check)
- [ ] Responsive + both themes; keyboard navigable

## Dependencies
Blocked by {{7.3}}; API from {{6.1}}.
@@END

@@ISSUE
key: 9.2
title: 9.2 — Admin users list & user details screens
labels: type:task, phase:9, area:client, priority:P0
milestone: M9
parent: E9
---
Part of {{E9}}.

## Context
PROMPT.md: searchable user list with exact columns; details page with edit, password reset, deactivate, and the privacy-bounded resume metadata list with delete.

## Scope
- Users list: search (id/email/name, debounced, server-driven), table — Full Name, email, registration date, last active, resume count, analysis count, actions **Details · Deactivate** (confirm); pagination/sort
- Details: edit name/email (inline form, 409 on collision), reset password (both modes from {{6.2}} — temp password shown once with copy, or send-mail), deactivate/reactivate with status badge
- Resume metadata list (name, analysis count, status — **no content**); delete with cascade-warning ConfirmDialog ({{6.3}})
- Self-deactivation control hidden for own account

## Acceptance criteria
- [ ] Search by each criterion drives server queries (MSW asserts params); empty results state
- [ ] All actions reflect API state with optimistic/rollback handling and error toasts
- [ ] Temp password displayed exactly once with copy button, never re-fetchable
- [ ] No resume-content fields exist in rendered DOM or network payloads (assertion on DTO usage)
- [ ] Cascade delete warns explicitly (lists analyses count) before deleting

## Dependencies
Blocked by {{9.1}}; API from {{6.2}}, {{6.3}}.
@@END

@@ISSUE
key: 9.3
title: 9.3 — Admin settings: AI models management UI
labels: type:task, phase:9, area:client, priority:P0
milestone: M9
parent: E9
---
Part of {{E9}}.

## Context
PROMPT.md Settings: model list with masked keys; add models + keys. UI over {{6.4}}.

## Scope
- Models table: model name, provider, masked key (`••••last4`), status, usages, last used
- Add-model form: provider, model name, API key (password-type input), usages multi-select; live-validation errors from the create ping surfaced inline
- Row actions: disable/enable, rotate key (modal with new-key input), delete (guard error 409 surfaced when last-active)

## Acceptance criteria
- [ ] Key visible only as last4 after create; never appears in subsequent network responses (MSW contract) or DOM
- [ ] Invalid-key create error shown inline; form preserves other fields
- [ ] Rotate updates the mask; disable flips status; delete-last-active shows the guard explanation
- [ ] Form keyboard-accessible; key input never autocompletes (`autocomplete=off`, `type=password`)

## Dependencies
Blocked by {{9.1}}; API from {{6.4}}.
@@END

@@ISSUE
key: 9.4
title: 9.4 — Resume export service: DOCX + PDF endpoints (server)
labels: type:task, phase:9, area:server, priority:P0
milestone: M9
parent: E9
---
Part of {{E9}}.

## Context
PROMPT.md download dropdown (PDF/DOCX) on apply-suggestions. Per D11: `docx` package for DOCX, Puppeteer HTML print template for PDF.

## Scope
- `ExportModule`: `GET /api/v1/resumes/:id/export?format=docx|pdf` (owner only)
- DOCX: `docx` lib mapping **every** json-resume section with sane typography (headings, date ranges, highlight bullets, skill groups)
- PDF: dedicated print HTML template (same data; print-grade styles consistent with the app's resume view) rendered by Puppeteer; chromium flags for containers (`--no-sandbox` with non-root user; executable path from env)
- Streamed download, correct `Content-Type`/`Content-Disposition` (filename = resume name slug + extension)
- Concurrency limit (default 2) + per-resume-version 10-min cache; export of foreign/deleted resume → 404/410

## Acceptance criteria
- [ ] Full-fixture resume: DOCX opens in Word/LibreOffice, PDF in readers — all sections present, ordered, no mojibake (golden checks + manual sign-off note)
- [ ] Special chars, RTL-safe text, very long resumes (10 pages) render without crash
- [ ] 5 concurrent exports succeed (queued by limiter); 404 on foreign id; 410 on deleted
- [ ] Cache: second identical request served from cache (timing/log assertion), invalidated on resume edit
- [ ] Works inside the Docker image (verified again in {{11.1}})

## Dependencies
Blocked by {{3.2}}; consumed by {{8.11}}, {{9.5}}.
@@END

@@ISSUE
key: 9.5
title: 9.5 — Export wiring + admin client tests
labels: type:task, phase:9, area:client, priority:P1
milestone: M9
parent: E9
---
Part of {{E9}}.

## Context
Close the loop: enable the download dropdown ({{8.11}}), add export to the resume view, and lock admin UI logic with tests.

## Scope
- Wire download dropdown on apply-suggestions + resume view: fetch-as-blob with progress, proper filenames, error toasts
- Flip the {{8.11}} disabled state; RTL+MSW suites for 9.1–9.3

## Acceptance criteria
- [ ] Both formats download from both screens with correct filenames (MSW blob + one real-API check)
- [ ] Export error (500/429) surfaces a toast, UI recovers
- [ ] Admin feature folders coverage ≥80%
- [ ] Every PROMPT.md admin requirement traced to a test (list in PR)

## Dependencies
Blocked by {{9.1}}, {{9.2}}, {{9.3}}, {{9.4}}.
@@END

@@ISSUE
key: E10
title: [EPIC] Phase 10 — Integration, Quality & Hardening
labels: type:epic, phase:10, area:server
milestone: M10
---
## Phase goal
Turn a feature-complete app into a production-grade one: single-server SPA serving, accessibility/responsive/web-vitals passes, Sentry, OpenTelemetry, the Playwright E2E suite, a security hardening sweep, and the full documentation set.

## Exit criteria (phase gate)
- [ ] One server serves SPA + API with correct caching and 404 semantics
- [ ] axe: zero serious/critical; Lighthouse budgets met; Playwright green in CI
- [ ] Security review signed off (zero open high/critical)
- [ ] A new developer can go zero→running from README alone

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N` · changed endpoints keep exhaustive Swagger annotations (per {{1.9}}).

## References
PLAN.md §8 (P10), §10 E10; PROMPT.md Instructions (responsive, a11y, web vitals).
@@END

@@ISSUE
key: 10.1
title: 10.1 — SPA serving from NestJS (fallback, caching, 404 semantics)
labels: type:task, phase:10, area:server, priority:P0
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
CLAUDE.md: server serves `frontend/dist`; SPA 404s handled correctly. Single port in production.

## Scope
- Serve static `frontend/dist`: hashed assets with `Cache-Control: public, max-age=31536000, immutable`; `index.html` with `no-cache`
- SPA fallback: any non-`/api` GET without a file match → `index.html` (deep links work); unknown `/api/**` stays JSON 404 ({{1.5}}); truly missing asset files (e.g. `/assets/nope.js`) → real 404, not index.html
- Compression for static; works identically in `yarn start:prod` and in the Docker image

## Acceptance criteria
- [ ] e2e: `/resumes/abc` serves the app shell (200, html); `/api/v1/nope` → JSON 404 envelope; `/assets/missing.js` → 404
- [ ] curl shows immutable cache header on hashed assets and no-cache on index.html
- [ ] Frontend router 404 page renders for unknown client routes (served shell, client 404)
- [ ] Verified inside the Docker image ({{11.1}} re-checks)

## Dependencies
Blocked by {{1.5}}, {{7.1}}.
@@END

@@ISSUE
key: 10.2
title: 10.2 — Accessibility & responsive audit (axe in CI + manual matrix)
labels: type:task, phase:10, area:client, priority:P0
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
PROMPT.md mandates full accessibility and responsiveness across phones/tablets/desktops, both orientations.

## Scope
- Automated: axe checks in CI over key pages (landing, auth, dashboard, editor, review, analysis screens, admin) in both themes
- Manual: keyboard-only pass over every journey; focus management on route change + modals (trap, restore); ARIA roles/labels/landmarks; screen-reader sanity pass on the editor and progress screens
- Responsive QA matrix: 360 / 768 / 1024 / 1440 / 1920, portrait+landscape — documented checklist with fixes

## Acceptance criteria
- [ ] axe CI job: zero serious/critical violations on all checked pages/themes
- [ ] Keyboard-only checklist signed off (attached to PR); focus visibly managed on navigation and dialogs
- [ ] No horizontal scroll at any matrix breakpoint; touch targets ≥44px on mobile
- [ ] Editor + analysis progress usable with screen reader (notes attached)

## Dependencies
Blocked by {{8.12}}, {{9.5}}.
@@END

@@ISSUE
key: 10.3
title: 10.3 — Performance & web vitals (budgets in CI)
labels: type:task, phase:10, area:client, priority:P1
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
PROMPT.md: highest web-vitals scores. Budgets enforced, not aspirational.

## Scope
- Bundle analysis; budget: initial JS < 250KB gz (route-splitting verified per {{7.3}}); vendor chunking sanity
- Image/font strategy (preload critical font, `font-display: swap`); prefetch-on-intent for likely next routes
- Lighthouse CI: perf ≥90 on landing + dashboard (lab budgets committed)

## Acceptance criteria
- [ ] Lighthouse CI green against budgets (landing, dashboard; desktop+mobile presets)
- [ ] LCP < 2.5s, CLS < 0.1 (lab) on landing; TBT within budget
- [ ] Bundle budget enforced in CI (red on regression, demonstrated)
- [ ] No render-blocking third-party requests

## Dependencies
Blocked by {{10.1}}, {{10.2}}.
@@END

@@ISSUE
key: 10.4
title: 10.4 — Sentry integration (server + client, env-gated)
labels: type:task, phase:10, area:server, priority:P1
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
Approved scope: error tracking on both sides, strictly opt-in by env, PII-scrubbed.

## Scope
- Server: `@sentry/nestjs` — captures unhandled errors (expected 4xx filtered), requestId + route context, release tagging
- Client: `@sentry/react` — ErrorBoundary integration, release + environment tags, sourcemap upload in CI (build step, only when DSN secret present)
- Both: `beforeSend` PII scrub (emails, tokens, resume content fields), sample rates from env, no-op when DSN unset

## Acceptance criteria
- [ ] DSN unset → zero Sentry imports active at runtime (lazy init), zero network calls (asserted)
- [ ] Thrown test error visible in Sentry from both sides with sourcemapped stack (manual verification recorded)
- [ ] 404/422 envelopes do NOT create Sentry events; 500s do (filter test)
- [ ] Scrubber removes PII fields from event payloads (unit test on beforeSend)

## Dependencies
Blocked by {{1.5}}, {{7.4}}.
@@END

@@ISSUE
key: 10.5
title: 10.5 — OpenTelemetry: traces + metrics with trace-correlated logs
labels: type:task, phase:10, area:server, priority:P1
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
Approved scope: OTel traces/metrics. The flagship trace: one analysis = HTTP → job → 3 steps → LLM calls, connected.

## Scope
- NodeSDK (env-gated by `OTEL_EXPORTER_OTLP_ENDPOINT`): auto-instrumentations (HTTP/Express/Mongoose), OTLP exporter, resource attrs (`service.name`, version, env)
- Custom spans: job claim/execute ({{4.3}}), each analysis step, LLM invocation (model, token counts as attributes — never prompt content), export rendering, SSE connection count gauge
- Trace-id injected into pino log lines ({{1.4}}) for log↔trace correlation; key metrics: request duration histogram, job queue depth, analyses per status

## Acceptance criteria
- [ ] With a local collector (compose dev service), one full analysis renders as a single connected trace with the spans above (screenshot/export attached to PR)
- [ ] Logs carry `trace_id`/`span_id` when a span is active (asserted)
- [ ] Endpoint unset → SDK not initialized, zero overhead (boot log + benchmark sanity <5% delta on health endpoint)
- [ ] No PII/prompt text in span attributes (attribute allowlist test)

## Dependencies
Blocked by {{4.3}}, {{4.5}}, {{1.4}}.
@@END

@@ISSUE
key: 10.6
title: 10.6 — Playwright E2E suite (real stack, fake LLM)
labels: type:task, phase:10, area:infra, priority:P0
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
Approved scope: browser-level confidence over the full stack — compose `full` profile, seeded admin, deterministic fake LLM.

## Scope
- Playwright project: runs against `docker compose --profile full` (or dev servers locally) with `LLM_PROVIDER=fake`, seeded admin + fixture user
- Journeys: register/login/logout · create resume via form · upload fixture file → parse → review → save · full analysis lifecycle incl. bell behavior · apply suggestion · export both formats (download assertion) · admin: search user, deactivate, model add/disable · theme toggle persistence
- CI: on `main` + nightly ({{11.3}} wires it); trace+video on failure, HTML report artifact

## Acceptance criteria
- [ ] Suite green 3 consecutive CI runs; total runtime < 10 min
- [ ] Failures upload trace/video artifacts (demonstrated once)
- [ ] No fixed sleeps — event/locator-based waits only (review gate)
- [ ] Covers every PROMPT.md happy-path journey listed above (traceability table in repo docs)

## Dependencies
Blocked by {{8.12}}, {{9.5}}, {{11.2}} (compose full profile for CI mode; local dev-server mode may land first).
@@END

@@ISSUE
key: 10.7
title: 10.7 — Security hardening sweep (CSP, audits, IDOR matrix, gitleaks)
labels: type:task, phase:10, area:server, priority:P0
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
The systematic pre-launch security pass over the whole system, beyond per-phase reviews.

## Scope
- CSP: `script-src 'self'` + hashes (no unsafe-inline), report-only first → enforce; document any required exceptions
- CI gates: `yarn audit` fail-on-high, gitleaks secret scan, dependency pinning review
- IDOR sweep: table-driven e2e over **every** resource route × foreign-user id (resumes, analyses, notifications, exports, admin)
- Upload abuse re-check (polyglot files, zip bombs N/A but oversized multiparts, content-type confusion); cookie flags re-audit; security headers final pass
- Run `security-review` skill over the full repo; threat-model notes → `docs/security.md`

## Acceptance criteria
- [ ] CSP enforced with zero console violations across the app (both themes, all main screens)
- [ ] CI red on high/critical audit finding or leaked secret (both demonstrated on a test branch)
- [ ] IDOR matrix: 100% green (auto-enumerates routes; new routes auto-covered)
- [ ] Security review: zero open high/critical; `docs/security.md` committed
- [ ] Rate-limit buckets re-validated behind `trust proxy` (real client IPs)

## Dependencies
Blocked by {{10.1}}, {{9.5}}; complements {{2.8}}, {{6.5}}.
@@END

@@ISSUE
key: 10.8
title: 10.8 — Documentation set (README, CONTRIBUTING, runbook, architecture)
labels: type:task, phase:10, area:docs, priority:P0
milestone: M10
parent: E10
---
Part of {{E10}}.

## Context
Production readiness includes operability by humans: setup, conventions, and the runbook for when things break.

## Scope
- README: badges, quickstart matrix (local non-Docker / local Docker / Railway), prerequisites (Node 22, Yarn 1.x — `npm i -g yarn`, Docker), env var table (from `.env.example`), scripts reference
- CONTRIBUTING: workflow (branch → conventional commit → PR → checks), hook behavior, scope enum, branch protection
- `docs/runbook.md`: deploy/rollback (Railway), env/key rotation (master key! JWT secrets), Mongo backup/restore (volume snapshot + mongodump/restore drill), stuck-job recovery, seed commands, incident basics (reading traces/logs/Sentry)
- `docs/architecture.md`: distilled plan — module map, flows (upload→parse, analysis), decisions table; `.env.example` final audit ({{1.2}} parity test keeps it honest)

## Acceptance criteria
- [ ] Clean-clone test in CI container: README quickstart alone reaches a running app (scripted check)
- [ ] Every runbook procedure has exact copy-pasteable commands (spot-verified)
- [ ] Architecture doc reviewed against the implemented system (no stale claims)
- [ ] All docs lint (markdownlint) and link-check clean

## Dependencies
Blocked by {{10.1}}; finalized after {{11.4}} for Railway specifics (may merge in two passes).
@@END

@@ISSUE
key: E11
title: [EPIC] Phase 11 — Docker, CI/CD & Railway
labels: type:epic, phase:11, area:infra
milestone: M11
---
## Phase goal
Ship it: the production Docker image (Yarn build, Node runtime, Chromium for PDF export), the compose `full` profile completing both documented local modes, the finished CI/CD pipeline, the Railway deployment (app + Mongo service + volume), and the executed launch checklist ending in `v1.0.0`.

## Exit criteria (phase gate)
- [ ] `docker compose --profile full up` works from a clean checkout
- [ ] CI fully gates PRs (lint → tests → e2e → image build + smoke → audits)
- [ ] Production URL live on Railway: SPA + API + SSE + uploads-on-volume verified
- [ ] Launch checklist executed with evidence; release `v1.0.0` tagged

## Definition of Done — every task in this epic
Code + tests green · lint/typecheck clean · no secrets committed · docs/`.env.example` updated when config changes · conventional commits referencing the issue · PR per task, squash-merged with `Closes #N`.

## References
PLAN.md §8 (P11), §10 E11, §12 (deployment matrix), §13 (risks).
@@END

@@ISSUE
key: 11.1
title: 11.1 — Production Dockerfile (multi-stage, non-root, Chromium, healthcheck)
labels: type:task, phase:11, area:infra, priority:P0
milestone: M11
parent: E11
---
Part of {{E11}}.

## Context
One image serving SPA+API on Railway and in local full-Docker mode. Node images bundle Yarn 1 classic — **no corepack anywhere**.

## Scope
- Stage 1 (`node:22`): `yarn install --frozen-lockfile` (workspace-aware layer caching: manifests first) → build `shared` → `server` → `frontend`
- Stage 2 (`node:22`): `yarn install --production --frozen-lockfile` → pruned runtime `node_modules`
- Stage 3 (`node:22-slim`): chromium + fonts (fontconfig, liberation, noto) via apt; copy prod deps + `server/dist` + `frontend/dist`; `PUPPETEER_SKIP_DOWNLOAD=1` at install, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- Non-root `node` user; `tini` as PID 1; `HEALTHCHECK` → `/api/v1/health/ready`; OCI labels (version, revision); `.dockerignore`
- Targets: image < 900MB; build args for versions

## Acceptance criteria
- [ ] `docker build` + `docker run --env-file` → healthy container; SPA + API served on one port
- [ ] PDF export works **inside** the container (Puppeteer + chromium, non-root, `--no-sandbox` flags per {{9.4}})
- [ ] `whoami` in container = non-root; tini is PID 1; SIGTERM → graceful shutdown ({{1.8}}) observed in logs
- [ ] trivy scan: zero critical vulns (CI-gated in {{11.3}})
- [ ] Rebuild with only source changes hits dependency layer cache (build-log evidence)

## Dependencies
Blocked by {{10.1}}, {{9.4}}, {{1.6}}, {{1.8}}.
@@END

@@ISSUE
key: 11.2
title: 11.2 — Compose `full` profile + both local modes finalized
labels: type:task, phase:11, area:infra, priority:P0
milestone: M11
parent: E11
---
Part of {{E11}}.

## Context
Adi's requirement: local development both as normal deployment and Docker deployment. The `db` profile ({{0.7}}) covered mode (a); this completes mode (b) and documents both.

## Scope
- `full` profile: `app` (built image, `env_file: .env.docker`, depends_on mongo healthy, named volume mounted at `UPLOAD_DIR`, port 3000) + `mongo` (named volume, healthcheck)
- `.env.docker.example`; README finalization of both modes: (a) non-Docker — compose `db` + `yarn dev` in `server/` and `frontend/` (Vite proxy), (b) full Docker — `docker compose --profile full up --build`
- Optional dev service (profile `otel`): local OTLP collector for {{10.5}} verification

## Acceptance criteria
- [ ] Mode (a) and mode (b) verified from a clean checkout following README only
- [ ] Uploads + Mongo data survive `compose down && up` (named volumes); `down -v` documented as the reset
- [ ] App container waits for healthy Mongo (no crash-loop on cold start)
- [ ] Hot reload intact in mode (a); mode (b) serves SPA+API on `localhost:3000`

## Dependencies
Blocked by {{11.1}}, {{0.7}}.
@@END

@@ISSUE
key: 11.3
title: 11.3 — Complete CI/CD pipeline (gates, image smoke, e2e wiring)
labels: type:task, phase:11, area:infra, priority:P0
milestone: M11
parent: E11
---
Part of {{E11}}.

## Context
Finish what {{0.6}} skeletoned: every merge to `main` is proven deployable.

## Scope
- `ci.yml` final: changed-path filters; lint+typecheck+unit (workspace matrix); API e2e (memory server); builds; `openapi.json` artifact ({{1.9}}); `yarn audit` (fail high) + gitleaks; docker build → trivy → **image smoke** (run container, hit `/health/ready` + one real API call + fetch SPA shell); concurrency groups; yarn caching
- `e2e.yml`: Playwright vs compose `full` on push to `main` + nightly cron; artifacts on failure ({{10.6}})
- Documented required status checks for `main` branch protection (Adi enables in repo settings — exact list provided)

## Acceptance criteria
- [ ] PR pipeline < 10 min with warm caches; red on any gate blocks merge
- [ ] Image smoke catches a deliberately broken image (demonstrated on a test branch, then reverted)
- [ ] Nightly e2e runs visible; failure notifies via GitHub
- [ ] Branch-protection checklist posted in CONTRIBUTING and verified once enabled

## Dependencies
Blocked by {{0.6}}, {{11.1}}, {{10.6}}.
@@END

@@ISSUE
key: 11.4
title: 11.4 — Railway deployment (app from Dockerfile + Mongo service + volume)
labels: type:task, phase:11, area:infra, priority:P0
milestone: M11
parent: E11
---
Part of {{E11}}.

## Context
Adi's target: Railway, deployed as Docker. Railway builds the Dockerfile from GitHub on push to `main`.

## Scope
- Railway project: Mongo service (template, volume-backed) + app service from `adityaparab/CVantage` (Dockerfile builder, auto-deploy on `main`)
- `railway.json`: healthcheckPath `/api/v1/health/ready`, healthcheckTimeout, restartPolicy on-failure
- Volume mounted at `UPLOAD_DIR`; `MONGODB_URI` via Railway private-network reference variable; full env matrix set (secrets generated: JWT, cookie, master key); `PORT` from Railway honored; `trust proxy` verified
- Custom domain + HTTPS notes; rollback procedure (redeploy previous build) tested once
- Runbook section with exact steps (so Adi can reproduce without me; ~15 min)

## Acceptance criteria
- [ ] Production URL serves SPA + API; healthcheck green in Railway dashboard
- [ ] SSE works through Railway's proxy (heartbeat-verified on a live analysis)
- [ ] Upload → file persists across a redeploy (volume proof)
- [ ] Private-network Mongo connection (no public Mongo exposure)
- [ ] Rollback executed once and documented with screenshots/notes

## Needs from Adi
Railway account: either temporary access/token, or you run the documented steps (~15 min) while I verify.

## Dependencies
Blocked by {{11.1}}, {{11.3}}.
@@END

@@ISSUE
key: 11.5
title: 11.5 — Launch checklist & post-deploy verification → v1.0.0
labels: type:task, phase:11, area:infra, priority:P0
milestone: M11
parent: E11
---
Part of {{E11}}.

## Context
The final gate: prove production actually works — then tag it.

## Scope / checklist (each item with evidence in this issue)
- [ ] Seed admin on prod ({{1.11}}); admin login works
- [ ] Real-key smoke: 1 upload-parse + 1 full analysis on prod with real OpenAI key (needs `OPENAI_API_KEY` from Adi)
- [ ] Sentry test events from server + client visible (if DSN configured)
- [ ] OTel trace of the smoke analysis visible (if endpoint configured)
- [ ] Lighthouse against the prod URL (budgets from {{10.3}})
- [ ] Backup snapshot taken; restore drill on a scratch Railway service (runbook {{10.8}} procedure)
- [ ] Rate limits behave behind proxy (429 with real client IPs, not Railway's)
- [ ] Final `security-review` skill sign-off over the deployed configuration
- [ ] Tag `v1.0.0` + GitHub release with notes (feature summary, env matrix, known limitations)

## Acceptance criteria
- [ ] Every checklist item checked with linked evidence (logs/screenshots/trace links)
- [ ] Zero open P0/P1 issues across all milestones
- [ ] `v1.0.0` tagged on `main`; release notes published

## Dependencies
Blocked by {{11.4}} and all prior epics' exit criteria.
@@END
# END OF ISSUES SOURCE
