# Phase 3 security review — resume domain (issue #37 / 3.7)

Method mirrors `security-phase2.md`: each security property the phase must
hold, mapped to the automated test that enforces it. Anything not enforceable
by a test is listed under accepted risks with a rationale.

## Property → enforcement map

| #   | Property                                                                                                         | Enforced by                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Every resume route requires authentication; failures use the uniform error envelope                              | e2e `401 matrix: every resume route requires auth`                 |
| 2   | No cross-user reads — foreign GET is an existence-hiding 404                                                     | e2e `ownership: a second user gets 404 on foreign ids`             |
| 3   | No cross-user writes — foreign PATCH/DELETE are 404 and leave the doc untouched                                  | e2e `IDOR matrix completion` + ownership test                      |
| 4   | All queries are scoped `{ _id, userId, deletedAt: null }` at the service layer (IDOR impossible by construction) | unit `resumes.service.spec.ts` scope assertions                    |
| 5   | Malformed ids are 400 (no cast errors → 500)                                                                     | e2e `malformed ObjectId params are 400`                            |
| 6   | Lost-update protection: stale `version` → 409 with `currentVersion`                                              | e2e CRUD journey (OCC step); unit update tests                     |
| 7   | Per-user name uniqueness (case-insensitive, live docs only) → 409, including rename collisions                   | e2e `name uniqueness`                                              |
| 8   | Soft-deleted docs are unreachable through every endpoint                                                         | e2e `soft-deleted resumes stay dead`                               |
| 9   | Pagination input is bounded (page ≥ 1, 1 ≤ limit ≤ 100)                                                          | e2e `pagination edges`                                             |
| 10  | Upload trusts nothing client-sent: extension, declared MIME and magic bytes must all agree                       | unit upload sniffing tests; e2e spoofed-exe + mime-mismatch        |
| 11  | Upload size capped at 10 MB before buffering to storage                                                          | e2e oversize → 413                                                 |
| 12  | Upload rate-limited per user+IP                                                                                  | unit `hit('upload', …)` test                                       |
| 13  | Raw bytes never enter MongoDB; storage keys are server-generated `{userId}/{uuid}.{ext}`                         | unit storage tests + `assertSafeKey`; upload service tests         |
| 14  | Storage keys from the DB are re-validated before filesystem access (defense in depth vs path traversal)          | unit `assertSafeKey` suite                                         |
| 15  | Failed ingest cleans up the stored object (no orphans)                                                           | unit upload atomicity test                                         |
| 16  | Extraction failures are contained: typed reason on `uploadParse.error`, never a 500, resume row preserved        | e2e `corrupt content -> uploadParse failed`; extraction unit suite |
| 17  | Extraction is bounded: 30s timeout, 200k char cap (schema-enforced)                                              | extraction unit suite (timeout + truncation)                       |
| 18  | Encrypted/corrupt/empty files map to distinct, user-meaningful codes                                             | extraction unit suite                                              |
| 19  | `jsonResume` placeholders are never stored (prune pre-validate)                                                  | schema unit tests; shared `pruneEmpty` tests                       |
| 20  | Counter integrity is repairable (`resumeCount` drift)                                                            | ops e2e `reconcile-counters`                                       |

## Findings fixed during the sweep

- The Phase-2 sweep style surfaced nothing new at the route layer this time;
  the docs contract test (#18) had already forced every new route through the
  guard/error/document conventions before it could land.
- Typecheck now includes `test/**` (was `src/**` only) — three latent type
  errors in e2e helpers were found and fixed under #36.

## Accepted risks (deliberate, revisit later)

1. **Uploaded blobs persist after soft-delete.** Restore/undelete stays
   possible and admin purge tooling is the right owner — tracked for the admin
   phase (#51+). Keys are unguessable (uuid) and never exposed raw.
2. **Inline extraction adds latency to the upload request** (bounded at 30s,
   typically <1s). Moving it onto the #41 job runner is a one-line change once
   that lands; the synchronous form keeps the review screen immediately useful.
3. **Legacy `.doc` happy-path extraction is not fixture-tested** — building a
   real OLE2 Word binary in-test isn't practical. The corrupt-path typed error
   is covered; word-extractor's own suite covers the format. Real-file smoke
   happens in #46.
4. **MIME sniffing is container-level** (PDF/zip/OLE2 magic), not full format
   validation — the extraction layer is the second gate and fails typed, so a
   crafted-but-valid container gains nothing beyond a failed parse row.
