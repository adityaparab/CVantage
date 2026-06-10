# Security review — Phase 2 (AuthN/AuthZ & Users)

Reviewed surface: `server/src/auth/**`, `server/src/users/**`, `server/src/mail/**`,
guards, error filter, cookies. Date: 2026-06-10 (issue #29 / 2.8).

## Verified properties (each backed by a test)

| Property                           | Mechanism                                                                   | Test                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| No user enumeration via login      | uniform 401 + dummy-hash burn                                               | `auth.service.spec` (timing burn), e2e identical-message |
| No enumeration via forgot-password | uniform 202 body/path                                                       | e2e ghost-vs-real comparison                             |
| Stolen refresh containment         | rotation + family revocation on replay                                      | `tokens.service.spec`, e2e family kill                   |
| Token at rest                      | sha256 only (refresh, verify, reset)                                        | issue/consume specs                                      |
| JWT hardening                      | HS256 pinned, issuer/audience enforced, alg=none rejected                   | `tokens.service.spec`                                    |
| Session cookies                    | httpOnly, SameSite=Lax, Secure in prod, refresh path-scoped to /api/v1/auth | e2e cookie assertions                                    |
| Deactivation is immediate          | per-request fresh account load + ActiveUserGuard                            | `guards.spec`                                            |
| RBAC                               | RolesGuard matrix                                                           | `guards.spec`                                            |
| Credential stuffing                | progressive lockout (email+IP), IP bucket survives successes                | `lockout.service.spec`, e2e                              |
| CSRF on OAuth                      | state+nonce in signed 10-min cookie, path-scoped                            | `oauth.controller.spec`                                  |
| Open-redirect                      | callback redirects only to APP_BASE_URL; reason URL-encoded                 | `oauth.controller.spec`                                  |
| Unverified-email linking           | blocked with explicit 409                                                   | `oauth.service.spec`                                     |
| Secrets in logs                    | pino redaction families incl. authorization/cookie/password/token/apiKey    | `logging.spec`                                           |
| Secrets in responses               | select:false + toJSON transforms + DTO whitelists                           | `schemas.spec`, controller specs                         |
| Password storage                   | argon2id (19MiB/2it)                                                        | register/reset specs                                     |
| Reset hygiene                      | single-use token, all sessions revoked, audited                             | e2e reset flow                                           |

## Findings fixed during this review

1. **Register endpoint lacked the strict request limiter** (lockout existed for
   login only). Fixed: `hit('register', email, ip)` gate → 429 with Retry-After.
2. **Reset-password endpoint lacked a request limiter** (token brute-force
   surface; 256-bit tokens make it impractical, but defense-in-depth). Fixed:
   per-IP `hit('reset')` gate.

## Accepted risks / known constraints (documented by design)

- **Registration discloses email existence via 409.** Accepted product
  behavior (PROMPT.md duplicate handling); enumeration-sensitive flows
  (login, forgot) are uniform.
- **Lockout store is in-memory** — resets on deploy and is per-instance.
  Acceptable under the single-instance Railway design (PLAN D7); swap to a
  shared store alongside any move to BullMQ/Redis.
- **OAuth id_token claims are decoded without local JWKS verification.**
  The token arrives over the direct TLS code-exchange with the provider
  (confidential client), which is the trust anchor; nonce binds it to our
  request. Revisit if tokens are ever accepted from the browser.
- **JwtAuthGuard performs one DB read per request** — deliberate (#24) so
  role/status changes apply instantly; lean+indexed by \_id.

## Follow-ups owed to later issues

- CSP + gitleaks + dependency-audit gates → #89/#95 (Phase 10/11 as planned)
- IDOR matrix expands as resource routes land (Phase 3+) → #37, #89
