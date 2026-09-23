# deployment Specification

## Purpose
Production configuration, external scheduler keep-alive, documentation, and the production boot contract for the free-tier stack (Render Free + Atlas M0). All scenarios in this capability are asserted by the deployment-config + production-boot tests in Session 20.

## ADDED Requirements

### Requirement: Production configuration manifest
The deployment SHALL ship a `render.yaml` at the repository root that describes a Render web service for the backend: runtime Node ~20, build command `npm ci && npm run build`, start command `npm run start:prod`, the Free instance type, and `envVars` covering every environment variable the application reads (the `.env.example` list) including `NODE_ENV=production`. `PORT` SHALL NOT be listed in `envVars`, because Render injects it and the app reads `process.env.PORT`.

#### Scenario: Blueprint commands match the package scripts
- **WHEN** `render.yaml` is parsed
- **THEN** `buildCommand` equals `npm ci && npm run build`
- **AND** `startCommand` equals `npm run start:prod`

#### Scenario: Env coverage matches .env.example
- **WHEN** the `envVars` keys in `render.yaml` are compared with the variable names declared in `/backend/.env.example`
- **THEN** every variable the application reads appears either with a dev default in `.env.example` or as a `sync: false` env var in `render.yaml`
- **AND** `NODE_ENV=production` is set for the web service

#### Scenario: PORT injected by the platform
- **WHEN** `render.yaml` is inspected for a `PORT` variable
- **THEN** no `PORT` entry exists in `envVars`, because Render injects it at runtime

### Requirement: Keep-alive scheduler workflow
The deployment SHALL ship a GitHub Actions scheduled workflow at `.github/workflows/keep-alive.yml` that runs every 15 minutes and calls `POST /api/v1/internal/jobs/run` on the deployed service with the `X-Jobs-Key` header taken from the `JOBS_KEY` repository secret, acting as the free external scheduler and warming the sleeping Render host.

#### Scenario: Scheduled every 15 minutes
- **WHEN** the workflow's `schedule` is inspected
- **THEN** it uses a cron expression equivalent to every 15 minutes (`*/15 * * * *`)

#### Scenario: Calls the internal jobs endpoint with the secret
- **WHEN** the workflow runs
- **THEN** it issues an HTTP POST to `https://<service>.onrender.com/api/v1/internal/jobs/run` with the header `X-Jobs-Key` from the `JOBS_KEY` repository secret
- **AND** the workflow does not fail the run on transient host cold-start errors so it doubles as a keep-alive ping

### Requirement: Deployment documentation
The deployment SHALL include `docs/DEPLOY.md` describing the exact click-path (Render dashboard and/or blueprint import), the full environment-variable list mapped to their sources (Atlas M0 `MONGO_URI`, Brevo `MAIL_*`, Supabase `STORAGE_*`/`SUPABASE_*`, JWT/jobs secrets, `PUBLIC_BASE_URL` = the Render URL), the scheduler setup (cron-job.org as primary, the keep-alive workflow as the no-card alternative), the Render health check wired to `GET /api/v1/health`, and the free-tier runtime rules.

#### Scenario: Document contents present
- **WHEN** `docs/DEPLOY.md` is read
- **THEN** it contains the click-path, every environment variable name with its source account/section, the scheduler setup steps, and the health check path `/api/v1/health`

### Requirement: Production boot smoke
The system SHALL boot under `NODE_ENV=production` with configuration read from the environment (and `.env`), expose the health endpoint to platform warm-ups, serve the strict production security posture, and SHALL NOT expose secret values in the health response or in the boot-time logs.

#### Scenario: Production boot stays healthy
- **WHEN** the application boots with `NODE_ENV=production`, `PORT`, and real-looking secret env values, and the Mongoose connection points at a reachable replica set
- **THEN** it starts, listens on the configured `PORT`, and `GET /api/v1/health` returns `200` with `{ status: 'ok', version }`

#### Scenario: No secrets leak in production boot
- **WHEN** the application boots in production with sentinel secret values set
- **THEN** neither the health response, its headers, nor the captured boot logs contain any sentinel secret value

#### Scenario: Production stays hardened
- **WHEN** the application boots with `NODE_ENV=production` and `SWAGGER_ENABLED=true`
- **THEN** the Swagger route is not exposed (`404`)
- **AND** the `Content-Security-Policy` header is the strict production default without third-party origins