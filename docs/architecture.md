# CVantage architecture (distilled)

One NestJS server (port 3000) serves the API under `/api/v1` and the built
React SPA from `frontend/dist` (immutable hashed assets, no-cache shell,
deep-link fallback). MongoDB is the only datastore; background work rides
on Mongo documents - no broker (decision D7).

## Module map (server/src)

| Module | Owns |
|---|---|
| config | zod-validated env (parity-tested vs .env.example), typed groups |
| database | 7 mongoose schemas ported from the canonical reference; TTLs, partial indexes, OCC |
| auth (+oauth) | argon2id, JWT access + rotating refresh (family revocation), lockout, verification/reset, Google/LinkedIn (feature-flagged) |
| users | self-service profile/stats/password |
| resumes | CRUD w/ OCC + soft delete, upload intake (triple-check), extraction (pdf/docx/doc), parse pipeline -> jsonResume |
| ai | crypto (AES-256-GCM), model registry (db -> env fallback), LlmService chokepoint (retries, repair, typed errors, fake provider) |
| jobs | Mongo job runner: atomic claim, heartbeats, recovery, drain |
| analyses | snapshot + 3 sequential steps + suggestion apply/dismiss |
| notifications | single-active-slot bell lifecycle |
| sse | per-user streams (snapshot-first), heartbeats, caps, drain |
| export | DOCX (docx) + PDF (puppeteer print template), cache + semaphore |
| admin | stats, user mgmt, metadata-only resume oversight, model mgmt |
| observability | pino w/ trace correlation, env-gated OTel + Sentry |
| spa / health / lifecycle | static serving, live/ready probes, graceful drain |

## The two flagship flows

**Upload → editable resume**: multipart → triple-check (ext/MIME/magic)
→ StorageService (local|s3) → resume row `uploadParse.pending` →
extraction (LangChain PDFLoader / mammoth / word-extractor, typed
failures) → parse job (injection-fenced prompt → shared zod schema →
pruneEmpty) → `jsonResume` + SSE/bell events → review screen.

**Analysis**: POST snapshots the resume → pending row IS the queue entry →
runner claims → compare / suggestions (fieldRef-validated) / interview
steps with incremental persistence + per-step SSE → rollups, tokensUsed,
notification replace-in-place → results screen → one-click apply mutates
the LIVE resume under OCC.

## Decisions that matter (from PLAN.md)

D7 Mongo job runner (BullMQ-swappable) · D9 model resolution db→env ·
D11 docx + puppeteer exports · D14 SSE w/ polling fallback · D15 ordered
idempotent cascades instead of transactions · D17 deterministic fake LLM
keeps the entire pyramid network-free.
