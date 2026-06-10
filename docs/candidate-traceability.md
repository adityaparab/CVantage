# Phase 8 gate — PROMPT.md candidate requirements → tests (issue #76 / 8.12)

83 frontend tests; per-folder coverage thresholds (≥80% lines on
`src/features/**`, showcase excluded) enforce in CI via `yarn test`
(vitest --coverage). The one-spec journey: register → create resume →
analyze → results → apply (`src/test/journey.spec.tsx`).

| PROMPT.md requirement                                                       | Test(s)                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Impactful landing (name, tagline, CTAs)                                     | journey landing smoke; auth-aware CTAs in `LandingPage`                |
| Register/Login incl. OAuth buttons per enabled provider                     | `auth-screens.spec` (providers on/off, 401, 429 countdown, 409 inline) |
| Password policy communicated                                                | strength-meter matrix (shared zod = server policy)                     |
| Dashboard counters                                                          | `dashboard.spec` stats cards                                           |
| Resume table: name, upload date, last analysis, status, Analyze/Edit/Delete | `dashboard.spec` column + action assertions                            |
| Delete with confirmation                                                    | optimistic-removal + rollback spec                                     |
| Live status updates without refresh                                         | FakeEventSource badge-flip spec                                        |
| Upload: drag/drop, type/size limits                                         | `upload.spec` precheck matrix + server-422 path                        |
| "AI is processing" progress + failure retry                                 | upload phase specs (completion nav, retry via reparse)                 |
| Review screen: form left, original text right                               | `review.spec` populate + side-panel + tab collapse markup              |
| Editor: every json-resume field editable, dates partial                     | `editor.spec` 12-section round-trip + date rejection                   |
| Placeholders never persisted                                                | pruned-payload capture (`{}` exactly for empty form)                   |
| Resume view: hover pencil per-field editing                                 | `resume-view.spec` scalar/date/array persistence + keyboard            |
| Concurrent-edit safety                                                      | 409 rollback + conflict toast spec                                     |
| Analysis start: preselected resume, Clear + Start                           | `analyze.spec` (guarded entry, counter bounds, clear scope)            |
| 3-step color-coded progress + bell persistence                              | `analysis-live.spec` (SSE animation, fallback, bell lifecycle)         |
| Completion cue + clearing rules                                             | exactly-once toast; bell clear + visit-clear (server #48 e2e)          |
| Results: scores, strong/weak, skills match/gaps, grouped suggestions, Q&A   | `results.spec` full-fixture fidelity + empty-state safety              |
| Apply per suggestion to the exact field                                     | `apply.spec` left-pane mutation + hover/keyboard highlight pairing     |
| Download dropdown (PDF/DOCX)                                                | present, disabled-with-tooltip until the export service (#9.4)         |

## Bug found by the gate

The create-flow dirty guard raced React state batching: navigating in the
mutation callback fired the "discard changes?" dialog after a successful
save. Fixed by navigating from an effect keyed on the saved id - the journey
spec now locks the regression.

## Phase 9 addendum — admin + export (issue #82 / 9.5)

| PROMPT.md requirement | Test(s) |
|---|---|
| Admin top navigation + dashboard counts | `admin-dashboard.spec` (card/endpoint parity, guard matrix) |
| User list: search + exact columns | `admin-users.spec` (debounced server params, column sweep) |
| User details: edit, password reset, deactivate | inline-edit 409, single-shot temp password w/ copy, status flips |
| Admin sees resume LIST never content | metadata table + DOM content-shape assertion |
| Delete user resume (with analyses) | cascade-warning confirm wired to #54 |
| Settings: models with masked keys, add with key | `admin-models.spec` (mask-only DOM, inline invalid-key, rotate, delete guard) |
| Download dropdown (PDF/DOCX) | `download.spec` both formats w/ server filenames + 503/500 toasts; server golden checks in `export.spec` |

Manual sign-off note (#81 AC): golden tests verify the DOCX package
content and the escaped print HTML; opening the files in Word/LibreOffice
and a PDF reader happens on the deployed build (chromium ships in the
Docker image, #93) - record the check in epic #77 when closing it.
