# Required status checks for `main` (issue #95 / 11.3)

Repo → Settings → Branches → protect `main` → require status checks:

- `root lint + format`
- `workspace (server)` / `workspace (frontend)` / `workspace (shared)`
- `openapi spec artifact`
- `bundle budget + lighthouse`
- `audit + secret scan`
- `playwright (real stack, fake LLM)`
- `docker build + trivy + smoke`
- `readme quickstart (clean clone)`

Also enable: require branches up to date; dismiss stale approvals.
(Names above match the job `name:` fields in ci.yml — verify against the
checks list of any recent PR once, then lock.)
