# Tasks: deployment

> Scope note: this session is Final-phase deployment wiring. No route/schema/state-machine changes; the deliverables are `render.yaml`, the keep-alive workflow, `docs/DEPLOY.md`, the `README.md` pointer, and the prod-mode/config e2e tests that pin them (roadmap S20 acceptance criteria 1 and 4).

## 1. Render blueprint

### Task: Write render.yaml
- [x] 1.1 Create `render.yaml` at the repo root: `rootDir: backend`, a single `web` service entry with runtime Node ~20, `buildCommand: npm ci && npm run build`, `startCommand: npm run start:prod`, `plan: free`, `healthCheckPath: /api/v1/health`, `envVars` for every variable the backend reads (`envVarKey` per `.env.example` name) with `sync: false`, plus `NODE_ENV: production`.

### Task: Verify env coverage against .env.example
- [x] 1.2 Confirm each name in `backend/.env.example` maps to a `render.yaml` envVar (or a documented dev-default niche) and that `PORT` is absent (Render injects it).

## 2. Keep-alive scheduler workflow

### Task: Write .github/workflows/keep-alive.yml
- [x] 2.1 Create `.github/workflows/keep-alive.yml` with `schedule: cron '*/15 * * * *'` and `workflow_dispatch`; one `ubuntu-latest` job that curls `https://${{ vars.RENDER_SERVICE_URL }}/api/v1/internal/jobs/run` with `-H "X-Jobs-Key: ${{ secrets.JOBS_KEY }}"` and `--retry`/`--retry-delay`, marked `continue-on-error: true` so host warm-up timeouts never fail the run.

## 3. Deployment documentation

### Task: Write docs/DEPLOY.md
- [x] 3.1 Create `docs/DEPLOY.md`: Render click-path (New → Web Service → repo/branch, Build `npm ci && npm run build`, Start `npm run start:prod`, free instance) and Blueprint import alternative; full env table mapped to §3 sources (Atlas `MONGO_URI` + `0.0.0.0/0` allowlist + db name, Brevo `MAIL_*`, Supabase `STORAGE_*`/`SUPABASE_*`, JWT/jobs secrets, `CORS_ORIGIN`, `PUBLIC_BASE_URL` = Render URL); `PORT`/`NODE_ENV` notes; scheduler setup (cron-job.org primary, keep-alive workflow + GitHub Secrets `JOBS_KEY`/variable `RENDER_SERVICE_URL` as no-card alternative); health check `/api/v1/health`; seeds as a one-shot ephemeral-disk command; free-tier envelope rules (no Redis/queues, `STORAGE_PROVIDER=supabase`, no runtime disk writes).

### Task: Point README at DEPLOY.md
- [x] 3.2 Add a short "Deployment" section to `backend/README.md` linking `docs/DEPLOY.md` and the prod smoke command (`npm run build && npm run start:prod` with a real `MONGO_URI`).

## 4. Prod-mode boot e2e

### Task: Write backend/test/production.e2e-spec.ts
- [x] 4.1 Boot the real app through `configureApp` (from `src/main`) against the memory replica set with `NODE_ENV=production`, sentinel secrets, a collecting `LoggerService`, and `SWAGGER_ENABLED=true`; assert `GET /api/v1/health` returns `200 { status: 'ok', version }`, none of the sentinel values appear in the health body/headers or the captured boot logs, the Swagger route is `404`, and the `Content-Security-Policy` header is the strict production default.

## 5. Deployment-config assertions

### Task: Write backend/test/deployment-config.e2e-spec.ts
- [x] 5.1 Read `render.yaml`, `.env.example`, `.github/workflows/keep-alive.yml`, and `docs/DEPLOY.md` via `path.resolve(__dirname, '../..')`; assert the blueprint's build/start commands match the npm scripts, every `.env.example` name has a matching envVar or documented dev default, no `PORT` envVar, the workflow schedule is `*/15 * * * *` and uses the `JOBS_KEY` secret + `X-Jobs-Key` header, and DEPLOY.md contains the click-path, `/api/v1/health`, and the env names.

## 6. Verification and wrap-up

### Task: Full verification
- [x] 6.1 From `backend/`: `npm run build`; `npm run lint`; `npm test`; `npm run test:e2e` — all green.
- [x] 6.2 From the repo root: `openspec validate deployment` and `openspec validate --all --strict` pass.
- [x] 6.3 `openspec archive deployment -y` archives the change cleanly.
- [ ] 6.4 Commit locally `chore(deploy): Render + Atlas config, scheduler notes, keep-alive workflow` — stage only this change's files (`render.yaml`, `.github/workflows/keep-alive.yml`, `docs/DEPLOY.md`, `backend/README.md`, the two e2e specs, `openspec/changes/deployment/*`, the archived folder); never `git add -A`.