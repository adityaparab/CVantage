# AI platform real-provider smoke (issue #46 / 4.8)

Everything in Phase 4 is proven against the deterministic fake provider
(D17). Before the phase closes, run ONE real smoke against OpenAI and record
the results in epic #38.

## Run

```bash
OPENAI_API_KEY=sk-... yarn workspace @cvantage/server smoke:llm
# optional: OPENAI_BASE_URL / LLM_PARSING_MODEL / LLM_ANALYSIS_MODEL
```

The script performs one real resume parse and one real compare step and
prints: model used, duration, token usage, and output sanity fields.

## Record in epic #38

| Field                                             | Value |
| ------------------------------------------------- | ----- |
| Date / runner                                     |       |
| Parsing model · duration · tokens                 |       |
| Analysis model · duration · tokens                |       |
| Output sanity (basics correct? scores plausible?) |       |
| Prompt adjustments needed                         |       |

## Requirement traceability (PROMPT.md analysis features → tests)

| Requirement                                | Enforced by                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Upload → AI parse → editable json-resume   | e2e `background parse: fake LLM fills jsonResume`; parse-pipeline unit suite |
| Parse failure visible + retryable          | e2e `reparse: only failed parses`; reparse unit matrix                       |
| Compare resume vs JD with scores           | e2e `full journey`; compare schema bounds in `analysis.schemas.ts`           |
| Grouped suggestions with one-click apply   | apply deep-path table; e2e apply journey                                     |
| Suggestions target real resume fields      | fieldRef resolver suite; poisoned-fixture drop test                          |
| Interview questions with suggested answers | questions schema + full-journey e2e                                          |
| Per-step progress visibility               | step status/timestamps assertions; progress-bus events                       |
| Failure mid-pipeline keeps earlier results | `step-2 failure` unit + e2e                                                  |
| Analyses survive restarts/crashes          | runner recovery suite + CI kill-recovery e2e                                 |
| Runaway cost protection                    | concurrency 429 test; max_tokens passthrough; input cap test                 |
| Token spend visibility                     | tokensUsed rollup tests + GET /analyses/:id e2e                              |

## Status

- [x] Coverage ≥80% on `ai/` (93.8), `jobs/` (98.8), `analyses/` (84.0)
- [x] Lifecycle e2e suites in CI (stability tracked across subsequent runs)
- [ ] Real-provider smoke executed (needs `OPENAI_API_KEY` from Adi)
