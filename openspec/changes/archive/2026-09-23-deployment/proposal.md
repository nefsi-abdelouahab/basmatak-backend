# Deployment (Session 20)

## Why

Sessions 1–19 verified everything against the in-memory replica set with local fallbacks; the backend has never been wired to the real free-tier stack the inventory §10 mandates (Render Free + Atlas M0 + free external scheduler). Without this change there is no production runtime, no scheduler, and definition-of-done item 7 (deployment config present) is unmet.

## What Changes

- **`render.yaml`** at the repo root (Render Blueprint): a Node web service, Free instance, `buildCommand: npm ci && npm run build`, `startCommand: npm run start:prod`, `envVars` covering every var the backend reads (the `.env.example` list) plus `NODE_ENV=production`; `PORT` is injected by Render and read via `process.env.PORT`. The Render-dashboard click-path equivalent is captured in `docs/DEPLOY.md`.
- **`.github/workflows/keep-alive.yml`** (A8/§3.5 alternative): scheduled every 15 minutes, calls `POST /api/v1/internal/jobs/run` on the Render service with `X-Jobs-Key` from the `JOBS_KEY` repository secret, and also warms the sleeping free host.
- **`docs/DEPLOY.md`**: exact click-path, the full env list mapped to the §3 accounts (Atlas URI/allowlist, Brevo SMTP, Supabase, JWT/jobs secrets, `PUBLIC_BASE_URL` = Render URL), scheduler setup (cron-job.org primary, keep-alive workflow as no-card alternative), health-check wiring to `GET /api/v1/health`, and the free-tier envelope rules (no Redis/queues, no runtime local disk, seeds via a one-shot one-off job on the ephemeral disk).
- **Prod-mode boot e2e** (`backend/test/production.e2e-spec.ts`) + a deployment-config assertion spec: boots the real app through `configureApp` with `NODE_ENV=production` + sentinel secrets against the memory DB and asserts `/api/v1/health` returns `200 { status: 'ok' }` with no secret values in the response, Swagger hidden, strict CSP; a config test asserts `render.yaml`/workflow/`.env.example`/`docs/DEPLOY.md` alignment (acceptance criterion 1).
- **`backend/README.md`**: a one-line deploy pointer to `docs/DEPLOY.md`.

## Capabilities

### New Capabilities
- `deployment`: production configuration manifest (`render.yaml` aligned with `.env.example`, `npm ci && npm run build` / `npm run start:prod`, Free instance, `PORT` injected, `NODE_ENV=production`); the keep-alive scheduler workflow contract; `docs/DEPLOY.md` contents; and the production boot smoke (health reachable, no secret leakage, Swagger gated).

### Modified Capabilities
- `common-core`: the **Bootstrap configuration** requirement gains the platform-injected `PORT` in production; the **Health endpoint** requirement gains the Render keep-alive warm-up scenario (liveness reachable in `NODE_ENV=production`).

## Impact

- **Config/ops**: `render.yaml`, `.github/workflows/keep-alive.yml`, `docs/DEPLOY.md`, `backend/README.md` pointer. No code behavior changes to routes, collections, or state machines.
- **APIs**: none change; `/api/v1/health` contract unchanged (new production scenario only).
- **Verification**: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; `openspec validate deployment` + `--all --strict`; archive; commit `chore(deploy): Render + Atlas config, scheduler notes, keep-alive workflow` (stage only this change's files).