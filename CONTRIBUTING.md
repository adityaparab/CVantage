# Contributing to CVantage

## Workflow

Work is tracked as GitHub issues (12 phase epics → 85 tasks; see `PLAN.md`).
One issue at a time: implement → tests green → conventional commit referencing
the issue (`Closes #N`) → push. CI must stay green on `main`.

## Commit messages — conventional commits (enforced)

The `commit-msg` hook runs commitlint. Format:

```
<type>(<scope>): <imperative subject>  (#issue optional in subject)

[optional body — wrap at 100 chars]

Closes #N
```

- **Types:** `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `style`, `revert`
- **Scopes (enforced enum):** `server`, `frontend`, `shared`, `infra`, `docs`, `deps`
- Subject: lower-case start, no trailing period.

Examples:

```
feat(server): add health module with mongo readiness probe

Closes #15
```

```
fix(frontend): keep bell notification across route changes (#71)
```

## Pre-commit hook

Runs automatically (husky + lint-staged) on staged files:

1. `eslint --fix` (zero-warning policy)
2. `prettier --write`
3. Related unit tests for touched `server/`/`frontend/` sources
   (activates automatically once the jest/vitest harnesses land — issues #19/#63)

Auto-fixed files are re-staged by lint-staged. A commit that still fails lint
or related tests is blocked. `--no-verify` is discouraged — CI gates everything
again on push/PR.

## Hooks setup

Hooks install automatically via the root `prepare` script on `yarn install`.
Nothing manual to do.

## Branch protection (repo settings — recommended)

Protect `main`: require the CI status checks (list finalized in issue #95 / 11.3),
require linear history. Direct pushes are reserved for the issue-by-issue
implementation flow agreed in `PLAN.md` §11.
