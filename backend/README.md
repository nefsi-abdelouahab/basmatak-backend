# Basmatak Tatatoua — Backend

NestJS/TypeScript backend for **Basmatak Tatatoua (بصمتك تطوع)**, a volunteer
marketplace: organizations publish volunteering opportunities, volunteers apply,
submit evidence of completed tasks, and verified experiences turn into a public
"trust layer".

**V2 reconciliation (delivered):** on top of the v1 core loop, the backend now
ships neutral registry IDs (`VOL-/ORG-/OPP-/EXP-`) on volunteers, organizations,
opportunities and experiences; opt-out public volunteer profiles with stats and
public reviews; a full organization surface (fact sheet, profile completion,
participant roster, aggregates, activity feed, application/submission/experience
inboxes); enriched experiences (real durations, org identity, CSV export,
streamed PDF attestations); bookmarks (favorites) with card state; notification
preferences; admin analytics, filterable/CSV-exportable admin lists, status
histories, dossier assignment, atomic moderation actions and system notices;
and a settings/maintenance system-status surface. See
[`docs/ROADMAP_V2_REPORT.md`](../docs/ROADMAP_V2_REPORT.md) for the per-session
record.

## Modules

Core loop: `auth`, `users`, `volunteers`, `organizations`, `opportunities`,
`applications`, `participations`, `submissions`, `verifications` (experiences),
`reviews`, `media`, `notifications`, `portfolio`, `locations`, `skills`,
`admin`, `reports`, `trust`, `core` (settings, maintenance, system-status,
status-transitions, jobs), `common` (pagination, counters, seams).

V2 additions: `favorites` (bookmarks), `activity` (org + volunteer streams),
`counters` (registry-ID sequences), `notification_prefs` (per-user toggles);
`verifications/attestation` (streamed PDFs), `participations/org-dashboard`
(roster + aggregates), `admin` analytics/moderation-actions surfaces.

## Stack

- [NestJS 10](https://nestjs.com) + TypeScript (strict), MVC layout per module
- MongoDB via [Mongoose 8](https://mongoosejs.com) (single replica-set instance)
- JWT access/refresh auth with rotated, hashed sessions
- In-memory throttler + in-process events (single-instance, free-tier friendly)
- Swagger/OpenAPI at `/api/v1/docs` when `SWAGGER_ENABLED=true` (not `production`)
- Tests (unit + e2e) run against `mongodb-memory-server` — no external DB

## Prerequisites

- Node >= 20 LTS, npm >= 10
- A MongoDB for local runs: `MONGO_URI` (set in `.env`) or a local `mongod`
  (`mongodb://127.0.0.1:27017/basmatak` is the default when unset)

## Quickstart

```bash
npm install
cp .env.example .env   # fill in values — see "Environment variables"
npm run start:dev      # watch mode on http://localhost:3000/api/v1
```

- Health: `GET /api/v1/health` → `{ status: 'ok', version }`
- Swagger UI: `GET /api/v1/docs` (needs `SWAGGER_ENABLED=true` and
  `NODE_ENV != production`)
- Full route reference: [`docs/API.md`](../docs/API.md)

## Environment variables

Every variable the app reads, with the safe dev default when unset. All names
are exact — see [`backend/.env.example`](./.env.example) for per-line comments.

| Variable | Required (prod) | Default | Meaning |
|---|---|---|---|
| `PORT` | — (Render injects) | `3000` | HTTP port |
| `NODE_ENV` | ✓ | `development` | `production \| development \| test` |
| `MONGO_URI` | ✓ (prod) | `mongodb://127.0.0.1:27017/basmatak` | MongoDB connection string |
| `CORS_ORIGIN` | ✓ | `*` | Comma-separated allowed origins |
| `PUBLIC_BASE_URL` | ✓ | — | Public base URL used in links/emails |
| `LOG_LEVEL` | — | `log` | `log \| error \| warn \| debug \| verbose` |
| `SWAGGER_ENABLED` | — | `false` | `true` serves the Swagger UI (ignored in `production`) |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | — | defaults | In-memory rate limit per TTL window |
| `JOBS_KEY` | ✓ | — | Secret for `POST /api/v1/internal/jobs/run` (`X-Jobs-Key`) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✓ | **fail-fast at boot** | Token signing secrets |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | — | defaults | e.g. `15m` / `30d` |
| `EMAIL_VERIFICATION_REQUIRED` | — | `false` | Require verified email before publish/apply/submit |
| `MAIL_HOST` etc. | ✓ (prod) | empty → `LogMailService` | SMTP: `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` |
| `STORAGE_PROVIDER` | ✓ (prod) | `local` | `local` (writes to `./storage`, dev only) or `supabase` |
| `STORAGE_LOCAL_DIR` | — | `./storage` | Override for `STORAGE_PROVIDER=local` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | ✓ (prod) | — | Supabase Storage credentials |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✓ (prod) | — | Bootstrap admin created by the seed script |
| `PUBLISH_GATE_ENABLED` | — | `false` | Hard-lock publishing until the gate is released |

> When `MAIL_HOST` is empty all mail is rendered to the logger (`LogMailService`)
> — fine for dev, useless (but safe) in production.

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compile to `dist/` (`nest build`) |
| `npm run start:dev` | Watch-mode dev server |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |
| `npm run lint` | ESLint + Prettier (`--fix`) |
| `npm test` | Unit tests (in-memory MongoDB) |
| `npm run test:e2e` | E2E suite (in-memory MongoDB replica set) |
| `npm run seed:locations` | Seed wilayas + municipalities |
| `npm run seed:skills` | Seed skill categories + skills |
| `npm run seed:admin` | Create the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| `npm run seed:demo` | Seed a demo organization + a few opportunities |
| `npm run seed:backfill-registry-ids` | Idempotently mint missing `VOL-/ORG-/OPP-/EXP-` IDs on existing rows |
| `npm run seed:all` | Locations → skills → admin → demo |

Seed scripts are idempotent and driven by `src/scripts/seed.ts`
(`--only <group>` selects a group). They write to whatever `MONGO_URI` points at.

## Testing

All automated tests use an in-memory MongoDB replica set — no external DB is
needed or touched:

```bash
npm run lint
npm test
npm run test:e2e
```

The database rig lives in `test/utils/test-db.ts` and is shared by every unit
and e2e test. E2E covers the full core loop (register → apply → submit →
verify), every V2 surface, plus the deployment configuration contract
(`deployment-config`). Current scale: 64 unit suites (627 tests), 42 e2e
suites (487 tests). The final acceptance gate is
`test/e2e/reconciliation.e2e-spec.ts` (Session 21): registry-ID presence and
legacy-code absence, presence + authz smoke on every RP Part 7 route, the
re-verified product decisions, CSV/PDF streaming checks, and a perf smoke.

## Deployment

Full deploy instructions — Render blueprint/click-path, the environment table,
external scheduler + keep-alive, free-tier runtime rules, rollback — live in
[`docs/DEPLOY.md`](../docs/DEPLOY.md). The machine-checkable Render blueprint is
[`render.yaml`](../render.yaml).

Local production smoke (compiled boot against a real `MONGO_URI`):

```bash
npm run build
npm run start:prod
```

## Deferred features

Out of MVP by design (tracked in [`backend-inventory.md`](../backend-inventory.md), §9):

- **Organization team members** — each organization page is a single account
  (`organizations.userId` unique). Multi-member orgs would add an
  `organization_members` collection, an invitation token type, a membership
  guard, and route migration to `/organizations/:organizationId/...`.

## Docs & specs

- Roadmap v2 (sessions, acceptance criteria): [`docs/ROADMAP_V2.md`](../docs/ROADMAP_V2.md)
- V2 delivery report (per-session record + frontend-readiness verdict): [`docs/ROADMAP_V2_REPORT.md`](../docs/ROADMAP_V2_REPORT.md)
- Reconciliation source (conflict classification, contract decisions): [`docs/RESOLUTION_PLAN.md`](../docs/RESOLUTION_PLAN.md)
- Roadmap v1 (sessions, acceptance criteria): [`docs/ROADMAP.md`](../docs/ROADMAP.md)
- Route/API reference: [`docs/API.md`](../docs/API.md)
- Source of truth for scope: [`backend-inventory.md`](../backend-inventory.md)
- Deployment runbook: [`docs/DEPLOY.md`](../docs/DEPLOY.md)
- OpenSpec validation: `openspec list`, `openspec validate --all --strict`

## Infrastructure notes

- Atlas network rule `0.0.0.0/0` is a **temporary-at-MVP** convenience so the
  app can connect from anywhere. Restrict the allowlist to known static IPs /
  office ranges before production.