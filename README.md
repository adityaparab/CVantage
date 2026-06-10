# CVantage

**CV + vantage point** — AI-powered resume analysis. Upload or build a
resume, paste a job description, get match scores, skill gaps, one-click
suggestions and interview prep.

![CI](https://github.com/adityaparab/CVantage/actions/workflows/ci.yml/badge.svg)

NestJS 11 · MongoDB/Mongoose 8 · React 19 + Vite 6 · TanStack Query ·
Tailwind v4 · LangChain (OpenAI-compatible) · SSE live progress ·
OTel + Sentry (env-gated) · Playwright

## Prerequisites

- Node 22 (`nvm use 22`)
- Yarn 1.x classic: `npm i -g yarn` (no corepack)
- Docker (only for the Mongo container / full-stack profile)

## Quickstart

```bash
git clone https://github.com/adityaparab/CVantage.git && cd CVantage
yarn install
cp .env.example .env            # dev defaults work out of the box
docker compose --profile db up -d    # MongoDB on 27017
yarn dev                        # server :3000 + vite :5173 (proxied /api)
```

Open http://localhost:5173. API docs: http://localhost:3000/api/docs
(spec: `/api/docs-json`). Seed an admin:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Choose-A-Strong-1' \
  yarn workspace @cvantage/server seed:admin
```

AI calls use your `OPENAI_API_KEY` from `.env` (or admin-managed models in
Settings). For a zero-key demo set `LLM_PROVIDER=fake`.

### Run modes

| Mode | Command |
|---|---|
| Local dev (HMR) | `yarn dev` |
| Production build, one port | `yarn build && yarn workspace @cvantage/server start:prod` |
| Full stack in Docker | `cp .env.docker.example .env.docker` then `docker compose --profile full up --build` |
| Railway | see `docs/runbook.md` (≈15 min) |

Data (Mongo + uploads) survives `compose down` via named volumes;
`docker compose --profile full down -v` is the full reset.

## Scripts

| Script | What |
|---|---|
| `yarn dev` / `yarn build` / `yarn test` / `yarn lint` | all workspaces |
| `yarn workspace @cvantage/server test:e2e` | API e2e (in-memory Mongo) |
| `yarn e2e:browser` | Playwright over the built stack |
| `yarn workspace @cvantage/frontend test:fast` | vitest without coverage |
| `node scripts/check-bundle-budget.mjs` | bundle budget report |
| `yarn workspace @cvantage/server smoke:llm` | real-provider LLM smoke |

## Environment

Every key is documented in [`.env.example`](.env.example) and validated at
boot — a parity test keeps the two in lockstep. Highlights: `MONGODB_URI`,
JWT/cookie secrets (dev defaults rejected in production),
`MASTER_ENCRYPTION_KEY` (32-byte base64; encrypts provider keys),
`LLM_*`, OAuth pairs (feature-flagged), `SENTRY_DSN` /
`OTEL_EXPORTER_OTLP_ENDPOINT` (both optional, zero overhead unset).

## More

- [`docs/architecture.md`](docs/architecture.md) — module map + flows
- [`docs/runbook.md`](docs/runbook.md) — deploy, rotate, restore, recover
- [`docs/security.md`](docs/security.md) — threat model + enforcements
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow + conventions
