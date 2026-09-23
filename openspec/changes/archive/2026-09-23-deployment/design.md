# Design — deployment (Session 20)

## Context

Sessions 1–19 finished the codebase and verified it exclusively on `mongodb-memory-server` replica sets with local/mock fallbacks for mail, storage, and jobs. The inventory §10 free-tier stack (Render Free + Atlas M0 + free external scheduler) has never been wired: no `render.yaml`, no keep-alive workflow, and no deploy documentation (definition-of-done item 7). The jobs endpoint (`POST /api/v1/internal/jobs/run`, guarded by `X-Jobs-Key`) and the health endpoint (`GET /api/v1/health`) already exist; this session only points free-tier operators at them.

Audited before writing: `backend/src/main.ts` reads `process.env.PORT ?? 3000`; `AppModule` reads `.env` + env and defaults `MONGO_URI` to the local URI; Swagger is already gated by `SWAGGER_ENABLED` **and** `NODE_ENV !== 'production'` (S19); the secret-hygiene grep audit + boot-assertion test exist (S19, `common-core`); `backend/.env.example` already carries the 28-variable list; `.github/` today holds only `prompts/` and `skills/` — no workflows; `docs/` holds only `ROADMAP.md`.

## Goals / Non-Goals

**Goals:**
- A Render Blueprint (`render.yaml`) that a human can import, plus the dashboard click-path in `docs/DEPLOY.md` ("provide both", roadmap S20).
- An env contract: every variable the app reads lives in `.env.example` (dev/value) or `render.yaml` (`envVars`), with `NODE_ENV=production` set and `PORT` left to Render.
- A `.github/workflows/keep-alive.yml` no-card scheduler that calls the internal jobs endpoint every 15 minutes and warms the sleeping host.
- A prod-mode e2e proving the app boots under `NODE_ENV=production`, serves `/api/v1/health`, stays hardened (Swagger off, strict CSP), and leaks no secret values.
- `docs/DEPLOY.md` and a `README.md` pointer.

**Non-Goals:** CI/CD pipelines (roadmap out of scope), frontend deployment, vertical upgrades, real Atlas/Brevo/Supabase connections in CI (the smoke runs on the memory DB), or any route/schema/state-machine behavior change.

## Decisions

### D1 — Render as a Blueprint (`render.yaml`) + dashboard click-path doc
- Ship `render.yaml` at the repo root (`rootDir: backend`, so `npm` runs inside `/backend`), Node runtime ~20, `buildCommand: npm ci && npm run build`, `startCommand: npm run start:prod`, `plan: free`, `region` free-tier e.g. `ohio`/`oregon`, healthCheckPath `/api/v1/health`.
- Mirror the same steps as a numbered click-path in `docs/DEPLOY.md` (New → Web Service → repo/branch → branch `main`, Build/Start commands, Instance free, env table), so the human can choose either path.
- Alternative considered: dashboard-only doc (rejected — the roadmap asks for both; the blueprint makes the env contract machine-checkable).

### D2 — Env contract and the alignment test
- All 28 vars from `backend/.env.example` are listed in `render.yaml` `envVars` as `sync: false` (values come from Render's Secret Files/dashboard; secrets never committed), plus `NODE_ENV: production`; `PORT` is NOT listed.
- The alignment is asserted by `backend/test/deployment-config.e2e-spec.ts`: it reads `render.yaml`, `.env.example`, the workflow, and `docs/DEPLOY.md` from the repo root (resolved as `path.resolve(__dirname, '../..')` from `backend/test/`) and checks: build/start commands match the npm scripts; every `.env.example` name (or a documented dev-default name) has a `render.yaml` envVar; no `PORT` entry; workflow schedule + `X-Jobs-Key` + `JOBS_KEY` secret; DEPLOY.md contains the click-path, health path, and env names. This satisfies acceptance criterion "render.yaml + .env.example align".
- Alternative considered: hand-checking only (rejected — the roadmap's criterion 1 deserves a repeatable assertion).

### D3 — Keep-alive workflow semantics
- `.github/workflows/keep-alive.yml`: `schedule: cron '*/15 * * * *'`, `workflow_dispatch` for manual test, a single job on `ubuntu-latest` that curls `https://${{ vars.RENDER_SERVICE_URL }}/api/v1/internal/jobs/run` with `-H "X-Jobs-Key: ${{ secrets.JOBS_KEY }}"` and `--retry`/`--retry-delay` (free-host cold start ≈ 1 min). The step uses `continue-on-error: true` so a sleeping-host timeout warms the instance without failing the run — the ping effect is the point, mirroring the roadmap's "always call, tolerate cold starts".
- `RENDER_SERVICE_URL` is a repository **variable** (not a secret), `JOBS_KEY` a repository **secret** (documented in `docs/DEPLOY.md` §Setup GitHub Secrets).
- cron-job.org (primary, §3.5) is documented in `docs/DEPLOY.md` as the alternative the same endpoint — the workflow is the no-card alternative, not a replacement for cron-job.org.

### D4 — Production-boot e2e (roadmap "Tests to write")
- `backend/test/production.e2e-spec.ts` reuses the S19 `swagger-csp.e2e-spec.ts` boot pattern (`Test.createTestingModule` + real `configureApp`) against the memory replica set, with `NODE_ENV=production`, a sentinel-secret env set, and a **collecting logger** (a `LoggerService` implementation that appends every log line to an array) passed to `createNestApplication({ logger })` so boot logs are actually captured.
- Asserts: `GET /api/v1/health` → `200 { status: 'ok', version }`; no sentinel secret appears in the health body, headers, or the collected boot logs; Swagger `404` with `SWAGGER_ENABLED=true`; CSP is the strict production default (no third-party origins). The health response check doubles as the Render health-check verification.
- The local prod smoke (`npm run build && npm run start:prod` reading a real/env-file `MONGO_URI`) is documented as a manual command in `docs/DEPLOY.md`; CI cannot hold a real Atlas connection.

### D5 — Free-tier envelope and seeds
- Add to `docs/DEPLOY.md`: no Redis/queues/push/SMS (inventory §10 rules); no runtime local-disk writes (storage is Supabase, `STORAGE_PROVIDER=supabase`, dev `local` never set in production); `PUBLIC_BASE_URL` = the Render URL (used by `/verify/:code` links and emails); seeds (`npm run seed:admin`, `seed:all`) run as a **one-shot** command against the service's **ephemeral disk** at first boot — not in the start/health path.
- `backend/.env.example` requires no changes this session (it is already complete; "Render + Atlas alignment" needs no new var). Deviating note recorded if the render.yaml env list forces an `.env.example` edit.

## Risks / Trade-offs

- **Blueprint drift vs. dashboard reality** → the alignment test pins `render.yaml`; the DEPLOY.md click-path matches the blueprint commands exactly and both are human-reviewed at deploy time.
- **Cold starts vs. workflow failures** → `continue-on-error` + `--retry` on the keep-alive step; the jobs endpoint is idempotent and single-flighted (S1), so overlapping 15-min runs are safe.
- **Secrets in repo** → never: `sync: false` in `render.yaml`, `JOBS_KEY` only as a GitHub secret read at workflow runtime; the prod e2e's sentinel check guards the boot path against leakage.
- **Env-asset path brittleness in tests** → `__dirname`-relative resolution keeps the reads valid as long as files stay at the documented paths; failures are loud and self-explanatory.
- **A real Atlas smoke can't run in CI** → covered by the memory-DB prod boot (same config path) plus the manual `start:prod` command in DEPLOY.md.

## Migration

- Blueprint import creates the web service; a one-shot `npm run seed:admin` (and optionally `seed:all`) on the ephemeral disk plants the admin + demo data (§3.4, S17). Rollback = un-publish the service or revert the commit; no data migration (Atlas holds the data, independent of the host).

## Open Questions

- None blocking. The human still performs: §3 account creation, Render service creation/import, setting secrets/vars in Render and GitHub Secrets, and the cron-job.org (or keep-alive) schedule — all with exact steps now in `docs/DEPLOY.md`.