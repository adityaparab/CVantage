# CVantage runbook

## Deploy to Railway (~15 min, once)

1. Railway → New Project → **Deploy MongoDB** (template). Copy
   `MONGO_URL` from the service variables.
2. New Service → **GitHub repo** → `adityaparab/CVantage`. Railway detects
   the `Dockerfile` (root). Set variables:
   ```
   NODE_ENV=production
   PORT=3000
   MONGODB_URI=${MONGO_URL}            # reference the Mongo service var
   APP_BASE_URL=https://<your-domain>.up.railway.app
   JWT_ACCESS_SECRET=<openssl rand -base64 48>
   JWT_REFRESH_SECRET=<openssl rand -base64 48>
   COOKIE_SECRET=<openssl rand -base64 48>
   MASTER_ENCRYPTION_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
   OPENAI_API_KEY=sk-...
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   ```
3. Networking → Generate Domain → set it as `APP_BASE_URL` (redeploy).
4. Seed the first admin (Railway service → one-off command):
   ```
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='Strong-Pass-1' node server/dist/scripts/seed-admin.js
   ```
5. Verify: `https://<domain>/api/v1/health/ready` → 200; log in; Settings →
   add a model (or rely on the env key).

**Rollback**: Railway → Deployments → previous build → Redeploy. Mongo is
unaffected (schema changes are additive by convention).

## Key rotation

| Secret | Procedure |
|---|---|
| JWT secrets | set new values → redeploy. All sessions invalidate (users re-login). |
| COOKIE_SECRET | same as JWT; signed OAuth state cookies in flight fail safely. |
| MASTER_ENCRYPTION_KEY | **do not rotate blind** - stored model keys become undecryptable. Procedure: note keys from Settings (masked - have originals), rotate env, then re-enter each key via Settings → Rotate key. Resolution falls back to `OPENAI_API_KEY` meanwhile. |
| Provider API keys | Settings → model → Rotate key (validates live, re-encrypts). |

## Mongo backup / restore

```bash
# backup (Railway: use the service shell or a tunnel)
mongodump --uri "$MONGODB_URI" --archive=cvantage-$(date +%F).archive --gzip
# restore (drill quarterly)
mongorestore --uri "$MONGODB_URI" --archive=cvantage-YYYY-MM-DD.archive --gzip --drop
```
Volume snapshots: Railway → Mongo service → Backups (enable scheduled).

## Stuck jobs

Symptoms: analysis pinned at `in_progress`, no step movement.
1. The runner self-heals: stale heartbeats (>45s) requeue with
   `retryCount++` at boot and every 60s. Wait one cycle first.
2. Inspect: `db.analyses.find({status:'in_progress'},{claimedBy:1,heartbeatAt:1,retryCount:1})`
3. Force: `db.analyses.updateOne({_id:ObjectId('...')},{$set:{status:'pending'},$unset:{claimedBy:1,heartbeatAt:1}})`
4. Budget-exhausted (`status:'failed'`, error mentions retry budget):
   user-facing Retry resets it, or set `retryCount:0` + `status:'pending'`.
Counters drifted? `yarn workspace @cvantage/server reconcile:counters`.
Index drift? `yarn workspace @cvantage/server db:indexes`.

## Incident basics

- Every error response carries `requestId` — grep the logs for it; when
  OTel is on, log lines carry `trace_id` → open the trace (HTTP → job →
  steps → llm.invoke spans with token counts).
- Local trace inspection: `docker compose --profile obs up otel-collector`
  and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` — run one
  analysis, read the connected trace from the collector debug output.
- Sentry (when DSN set): 5xx-only, PII-scrubbed, tagged with requestId.
  First-deploy check: throw a test 500, confirm the event + sourcemapped
  client stack, record it in epic #83.
- SSE weirdness behind proxies: confirm `X-Accel-Buffering: no` reaches the
  client and that the platform allows streaming responses; the UI degrades
  to polling automatically.
