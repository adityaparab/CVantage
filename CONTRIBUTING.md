# Contributing

## Workflow

1. Branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Commit with **conventional commits** — enforced by commitlint:
   `type(scope): subject` with scope one of
   `server | frontend | shared | infra | docs | deps`.
3. Push and open a PR; CI must be green (lint, typecheck, unit suites with
   coverage gates, API e2e, Playwright, bundle budget, Lighthouse, audit +
   gitleaks).

## Hooks (husky)

- **pre-commit**: lint-staged → eslint --fix + prettier on staged files,
  then *related tests only* (jest `--findRelatedTests` server-side, `vitest
  related` client-side) — commits stay fast.
- **commit-msg**: commitlint.

## Conventions that bite

- Validation lives in `@cvantage/shared` zod schemas — client and server
  import the same objects. Never fork a schema.
- `process.env` is forbidden outside `server/src/config` and scripts
  (eslint-enforced). Add keys to the zod env schema + `.env.example`; a
  parity test fails otherwise.
- Every new API route must carry full Swagger metadata — the docs contract
  test fails the build if a route lacks summary/description/examples. New
  controllers must also be registered in `docs-probe.module.ts`.
- New admin routes are auto-covered by the RBAC matrix e2e; new resource
  routes belong in the IDOR matrix.
