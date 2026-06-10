# Launch checklist → v1.0.0 (issue #97 / 11.5)

Everything below runs against the PRODUCTION URL after the Railway deploy
(`docs/runbook.md`, ~15 min). Paste evidence (output/screenshot) per item
into issue #97, then `git tag v1.0.0 && git push --tags`.

| # | Check | How | Evidence |
|---|---|---|---|
| 1 | Healthcheck green | Railway dashboard + `curl /api/v1/health/ready` | |
| 2 | Seed admin + login | runbook seed command; sign in; admin dashboard renders | |
| 3 | Real-key smoke | with `OPENAI_API_KEY` set: upload a real PDF → parse completes → run one full analysis → scores plausible (also closes #46's pending AC) | |
| 4 | Export sign-off | download DOCX (opens in Word/LibreOffice) + PDF (chromium path baked in the image) — all sections present | |
| 5 | Sentry events | if DSN configured: trigger a test 500 server-side + a client error; both visible, client stack sourcemapped, no PII | |
| 6 | OTel trace | if endpoint configured: the smoke analysis renders as ONE connected trace (http → job → 3 steps → llm.invoke with token counts) | |
| 7 | Lighthouse vs prod | `npx @lhci/cli autorun --collect.url=https://<domain>/` — budgets from lighthouserc.json | |
| 8 | Rate limits behind proxy | 6 rapid bad logins from one machine → 429 with YOUR IP in the lockout (trust proxy verified); a second network unaffected | |
| 9 | Backup + restore drill | runbook mongodump → restore into a scratch Railway Mongo → row counts match | |
| 10 | Rollback once | Railway → redeploy previous build → health stays green | |
| 11 | Branch protection | enable the checks from docs/branch-protection.md | |
| 12 | Security sign-off | review docs/security.md against the deployed env (secrets set? swagger exposure decision? CSP headers present via `curl -I /`) | |

After tagging: close epics #1 #9 #21 #30 #38 #47 #51 #57 #64 #77 #83 #92
and the remaining task issues #46 (with item 3's evidence) and #97.
