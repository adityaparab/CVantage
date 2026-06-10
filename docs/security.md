# CVantage security posture (issue #90 / 10.7)

Consolidates the per-phase reviews (`security-phase2.md`, `-phase3.md`,
`-phase6.md`) into the system-wide picture. Every claim links to an
automated enforcement.

## Threat model summary

| Surface | Threats considered | Primary controls |
|---|---|---|
| Auth | credential stuffing, token theft/replay, session fixation | argon2id, progressive per-email+IP lockout, httpOnly/SameSite cookies, refresh rotation w/ family revocation on reuse, immediate deactivation enforcement |
| Resume data | IDOR, content leaks to admins, lost updates | userId-scoped queries by construction, system-wide IDOR e2e matrix, structural admin metadata whitelist, optimistic concurrency |
| Uploads | spoofed/corrupt/oversized files, parser abuse | triple-check (ext+MIME+magic bytes), 10MB pre-buffer cap, typed extraction failures, per-user upload rate limit |
| LLM | prompt injection, key leakage, runaway cost | DATA-fencing prompts, schema-validated outputs, fieldRef validation, keys AES-256-GCM at rest + masked everywhere + scrubbed from errors/traces/Sentry, per-user concurrency + max_tokens + input caps |
| Web | XSS, clickjacking, CSRF | strict CSP (`script-src 'self'`, zero inline scripts - theme init is an external file; swagger keeps a relaxed policy on /api/docs only), frame-ancestors 'none', SameSite=Lax cookies + no token in JS, helmet headers |
| Supply chain | malicious/vulnerable deps, leaked secrets | CI: yarn audit fail-on-high, gitleaks full-history scan, lockfile-frozen installs |
| Ops | log/trace PII, error-tracker leaks | pino redaction, OTel spans carry token COUNTS never content, Sentry beforeSend scrubber (unit-tested) |

## Cookie flags (re-audit)

`cvantage.access` / `cvantage.refresh`: httpOnly, SameSite=Lax,
Secure in production, refresh path-scoped to `/api/v1/auth`. No
localStorage/sessionStorage token handling anywhere (grep-clean).

## Known accepted risks (carried forward)

1. In-memory lockout/SSE/job-runner state is single-node by design (D7/D14).
2. Uploaded blobs persist after soft-delete until admin purge tooling.
3. `admin.model.update` audits under `admin.model.add` (canonical enum).
4. CSP allows `style-src-attr 'unsafe-inline'` for React style props
   (progress widths/gradients); script injection remains fully blocked.

## Verification pointers

- IDOR: `app.e2e-spec.ts` system-wide matrix + per-phase sweeps
- RBAC: introspection-driven admin matrix (auto-covers new routes)
- CSP: enforced headers via app.setup; swagger exception documented above
- Secrets: gitleaks in CI; `.secrets/` + `.env*` git-ignored and excluded
  from sync tooling
