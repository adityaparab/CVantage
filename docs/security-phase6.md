# Phase 6 security review — admin platform (issue #56 / 6.5)

Same method as phases 2/3: properties → enforcing tests; what a test cannot
hold is an accepted risk with rationale.

## Property → enforcement map

| #   | Property                                                                                       | Enforced by                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every admin route requires the admin role; anonymous 401, candidate 403, deactivated admin 403 | e2e RBAC matrix driven by route introspection (new routes auto-covered)                                                       |
| 2   | Admins can never read resume content, extracted text or analysis results                       | structural whitelist (projection + mapper) + whitelist test + e2e content sweep                                               |
| 3   | Admin hitting candidate content routes gets no foreign access                                  | denial e2e (404 on foreign GET /resumes/:id)                                                                                  |
| 4   | Raw provider API keys never serialize anywhere                                                 | masked mapper, audit-meta regression tests, e2e raw-key sweep over responses + auditlogs, ciphertext-shape assertion in mongo |
| 5   | Keys validated live before storage; invalid keys persist nothing                               | validate-first unit + e2e (422, empty list after)                                                                             |
| 6   | Deleting the last active model w/o env fallback is impossible                                  | delete-guard matrix (unit) + e2e 409 with orphaned usages                                                                     |
| 7   | Deactivation takes effect immediately                                                          | e2e: existing bearer 403s next request; refresh 401s (tokens revoked)                                                         |
| 8   | No self-lockout                                                                                | self-deactivation 409 (unit + e2e as the admin)                                                                               |
| 9   | Temporary passwords: hashed at rest, returned exactly once, never logged                       | unit (argon2id via hasher, single-shot return) + e2e login-with-temp                                                          |
| 10  | Every admin mutation writes an audit row with actor/target                                     | per-feature audit assertions + e2e action sweep (update/deactivate/password_reset/resume.delete/model add/remove/key_rotate)  |
| 11  | Audit rows never contain content or secrets                                                    | meta regression tests (#54 content, #55 keys)                                                                                 |
| 12  | Cascade delete is idempotent and counter-safe                                                  | partial-failure re-run unit + e2e re-run equality                                                                             |
| 13  | Stats are admin-only and cannot hammer the db                                                  | role matrix + cache tests                                                                                                     |

## PROMPT.md admin requirement traceability

| Requirement                                        | Test                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| Dashboard: users / resumes / analyses counts       | stats unit + e2e totals vs mongo truth          |
| User list with search, registration date, counters | #53 search e2e (email/name/id) + columns in DTO |
| User details + edit                                | patch e2e (+ collision 409)                     |
| Admin password reset                               | both modes e2e                                  |
| Deactivate / reactivate                            | lifecycle e2e                                   |
| See resume list, never content                     | whitelist + sweep                               |
| Delete resume incl. analyses                       | cascade e2e                                     |
| Model settings: list masked, add with key          | #55 journey                                     |

## Findings

- `update` model status/usages audits under `admin.model.add` because the
  AuditAction enum (ported verbatim from the canonical schema) has no
  `admin.model.update`. Logged as a wont-fix-here: enum evolution belongs to
  a schema-version bump, the row still records actor/target/changed fields.

## Accepted risks

1. **Role changes are not exposed** (no promote/demote endpoint) - PROMPT.md
   does not ask for one; admins are seeded (#20) or promoted via ops access.
   Self-demotion is therefore structurally impossible.
2. **Stats cache is per-process** - consistent with D7/D14 single-node
   posture; a stale-by-60s dashboard number is acceptable.
