# Basmatak Tatatoua (بصمتك تطوع) — Backend Roadmap

> Spec-driven build plan for the NestJS backend. Source of truth for scope: `backend-inventory.md` (at the repo root; this roadmap refers to it as "the inventory"). Tooling: OpenSpec **1.5.0** (verified `openspec --version`), schema `spec-driven`. Every numbered session produces exactly one OpenSpec change, is implemented in `/backend`, is validated and archived, and commits locally (never pushes).
>
> Version: 1 (2026-09-21)

---

## 1. Summary

**Goal.** Ship the entire backend of Basmatak Tatatoua, a volunteer marketplace: volunteers build verifiable public profiles, organizations post tasks and verify volunteers' work, and the resulting experiences are cryptographically-linkable via `/verify/:code`. Every module, route, collection and state machine is pre-defined in the inventory, so this roadmap only orders and amplifies that spec.

**Stack.** NestJS (latest stable, v10+) + TypeScript (strict) + MongoDB via Mongoose. JWT access/refresh with rotated, hashed sessions. Mongo transactions on Atlas/M0. Media in Supabase Storage behind a `StorageProvider`. Email via Brevo SMTP behind a `MailService`. In-app notifications backed by MongoDB. In-memory Throttler. **No Redis, no queues, no push, no paid SMS, no paid services** (inventory §10).

**Phases.** P1 = core loop (sessions 1–12), P2 = trust layer (13–14), P3 = admin/moderation/extras (15–16). Sessions 17–21 are integration/finalisation. Session 0 is bootstrap.

**How sessions work.** One session = one OpenSpec change (files `proposal.md`, `specs/<capability>/spec.md`, `design.md`, `tasks.md`) authored, then reviewed, then implemented, then verified, then archived with `openspec archive`, then committed locally. A generic runner prompt is in §5. Sessions within one phase may be run in order only; every "depends on" list is strict. When a session needs a capability owned by a later module, the earlier session programs against a small interface with an inert default implementation (the "extension seam" convention, codified in Session 1) and the later session swaps it in. This is how the roadmap stays buildable in order without inventing workarounds.

---

## 2. Assumptions and Review findings

### 2.1 Assumptions (recorded, not asked)

- **A1 — Inventory is normative.** Where this roadmap and the inventory differ, the inventory wins; where the inventory is silent, the assumptions below apply. The inventory currently lives at the repo root as `backend-inventory.md` (not under `docs/`); all references here point to that file. It is not renamed or moved.
- **A2 — Tool versions.** Node ≥ 20 LTS, npm ≥ 10, NestJS latest stable, Mongoose 8.x, `mongodb-memory-server` (dev) for replica-set-capable tests. All npm packages are `^`-pinned latest majors; nothing exotic.
- **A3 — Atlas is Mongo 6+, so replica-set transactions work on the free M0.** Local dev defaults to `mongodb://127.0.0.1:27017/basmatak` when `MONGO_URI` is unset; tests always use `mongodb-memory-server` with a single-node replica set (`replSet: { count: 1 }`).
- **A4 — Skill categories list.** The project document is **not present in this repo**, so the exact category list cannot be read. Session 17 (seed) plants the default list below and flags it for confirmation against the project document. It is pure data; no code depends on it:
  First Aid & Health · Education & Tutoring · Childcare & Youth · Elderly Care · Care for People with Disabilities · Animal Care · Environment & Cleanup · Agriculture & Reforestation · Construction & Renovation · IT & Programming · Digital Marketing & Social Media · Graphic Design & Photography · Videography · Translation & Languages · Legal & Administrative Support · Accounting & Finance · Event Management & Logistics · Catering & Food Distribution · Counseling & Psychosocial Support · Sports & Coaching · Music & Performing Arts · Communication & PR · Fundraising & Donation Management · Community Engagement · Blood Donation Support · Search & Rescue · Disaster Response · Clothes & Essentials Distribution.
- **A5 — Volunteer public-profile flags.** `publicProfile` is `{ enabled, showAvatar, showBiography, showLocation, showSkills, showExperiences, showAvailability, showPortfolio }` (all booleans). `GET /volunteers/:username` returns 404 when `publicProfile.enabled=false`; otherwise each section is gated by its `show*` flag.
- **A6 — `/verify/:code`.** Is a possession-based proof link: it resolves for any `verified` experience regardless of `publicVisibility` (the code is only known to the holder) and exposes the experience summary **plus only `visibility=public` media**. It never reveals a volunteer whose profile is disabled beyond this summary.
- **A7 — Publish gate off-by-default in P1.** The publish route always calls `PublishGateService` (seam from session 1). Until Session 13 the default implementation reports "unlocked" unless `PUBLISH_GATE_ENABLED=true`; Session 13 ships the real counter and the `publishGate.maxPendingOpportunities` read from `system_settings`.
- **A8 — External scheduler.** Free tier: **cron-job.org** (no card) as primary; a **GitHub Actions** scheduled workflow is the zero-dependency alternative (repo already has `.github/`) and doubles as a keep-alive for the sleeping Render host. It calls `POST /api/v1/internal/jobs/run` with `X-Jobs-Key`. Sessions run without it because E2E tests call the endpoint directly.
- **A9 — Single instance.** Render free = one instance, so in-memory Throttler and in-process EventEmitter are correct (no horizontal scaling). This is why no Redis.
- **A10 — Email gate.** A volunteer/organization must have a verified email to publish, apply, or submit. Submitting organization-verification documents also requires a verified account email (assumption; inventory only says documents are `mediaId`s).
- **A11 — Ordered emails / tokens.** Issuing a new `verification_tokens` row (type `email_verification` or `password_reset`) invalidates the previous unexpired rows of the same `(userId, type)`.
- **A12 — Slug and code generation.** Slugs via `slugify` (transliterated to ASCII, retry on `E11000` with a numeric suffix). Verification codes are 8 uppercase base32 chars from `crypto`, no `0/O/1/I`, retried on collision (a unique index backs it).
- **A13 — Streams.** `review ≠ verification` (inventory §2.16). `reviews` are created either inside the verify transaction (when `review` is passed) or later via `POST /submissions/:submissionId/review`; a unique `submissionId` index enforces "one per submission" and a duplicate attempt returns 409.
- **A14 — Suspended orgs.** Already-published opportunities of a suspended org stay visible to guests (only new publishes are blocked). Admins may force-close them via the admin route.

### 2.2 Review findings (problems found in the inventory, fix adopted in this roadmap)

| # | Problem | Where | Fix adopted |
|---|---|---|---|
| F1 | **Organization verification dead-end.** Orgs can submit documents but can only become `verified` via the P3 admin route, so no account can publish before Session 15 — the core loop is unbuildable until then, and a `rejected` org has no path back. | §2.7, §2.20, §5 (`organizations.verificationStatus`) | (a) `POST /organizations/me/verification` allows resubmission and moves `rejected → pending` (state machine: `pending → verified | rejected → pending`); (b) admin approve/reject stays P3; (c) Session 17 seeds the admin account + one verified demo org, and Session 18's E2E approves its fresh org via the admin route. |
| F2 | **Withdrawing an accepted application is inconsistent.** `withdraw` allows status `accepted` but nothing deactivates the `task_participants` row or decrements `positions.filledCount` — the volunteer stays in "My Tasks" (and gets activated by the job) and the seat stays taken. | §2.9, §2.10, §3, §5 | Session 7 makes withdrawing an **accepted** application a Mongo transaction (the third one): application → `withdrawn`, matching `task_participants` → `withdrawn` (conditional update → idempotent), `$inc filledCount: -1`. |
| F3 | **Accept-application transaction races.** The pre-check "opportunity `published` + seat free" then `findOneAndUpdate` is TOCTOU: the org could `close`/`cancel` mid-flight, and two concurrent accepts can over-book the last seat. | §5 accept transaction, §2.9 | Inside the transaction: re-read the opportunity and assert `published` and (if set) `applicationDeadline >= today`; increment the seat with an array-filtered update guarded by `filledCount < requiredCount` and abort if it matches nothing. |
| F4 | **Verify transaction event/notification non-atomicity.** "Status history + notification" is listed inside the transaction but notifications live in an in-process EventEmitter; a crash after commit would lose them or they'd split-brain with stats. | §5 verify transaction, §2.17, §0 | Convention (built in Session 1): transactional flows (accept, verify, accepted-withdraw) persist their status histories **and** notifications **inside the same transaction**, then emit events *after* commit only for non-critical side effects. Services accept a `ClientSession` and notification writes go through injected repositories. |
| F5 | **Public-profile privacy is under-specified.** The enable index exists but no rule defines 404-vs-visible, and `/verify/:code` vs `publicVisibility` is ambiguous. | §2.6, §2.13, §6 | Adopt assumptions A5/A6. Public feeds and `GET /organizations/:slug/opportunities` expose only `published`; public `GET /opportunities/:idOrSlug` returns 404 for anything not `published` unless the caller is the owning org. Implemented in Sessions 6 and 12. |
| F6 | **Media `purpose`/`visibility` are untyped**, and delete is only blocked for *verified-experience*-attached media — evidence of a `submitted`/`under_review` submission could be deleted, breaking a review already in progress. | §2.11, §7 | Hard enums in Session 8: `MediaPurpose { avatar, organization_logo, verification_document, submission_evidence, portfolio_item }`, `MediaVisibility { public, private }`. Delete is blocked when the media is referenced by a verified experience **or** by any submission not in a terminal state (`rejected`/`withdrawn`). A single `canReadMedia(actor, media)` helper implements the §6 matrix. |
| F7 | **Orphaned P2 session routes.** `POST /auth/logout-all` (§2.1) and `GET/DELETE /users/me/sessions` (§2.2) are marked P2, but no P2 change in §8 owns them. | §2.1, §2.2, §8 | Session 13 (trust-layer, P2) also implements these three small routes on the auth/users modules. |
| F8 | **Reliability would go stale / job gaps.** The job tick (§2.21) only does `startDate`; §4 suggests a cached `org.reliability` sub-document but nothing recomputes it. | §2.21, §4 | Session 13 extends the same job tick with reliability recomputation (upsert into `organizations.reliability`, subscribing to §4's event-triggered refresh) and emits a "task started" notification from the `startDate` handler. |
| F9 | **Ordering seams for `mediaId` and portfolio.** `PATCH /volunteers/me` takes `avatar (mediaId)` (S4) and org documents take `mediaId`s (S5) before the media module exists (S8); and `GET /volunteers/:username/portfolio` (S12) is declared before portfolio_items (S14). | §2.5, §2.7, §2.6, §8 order | Early sessions accept `mediaId` validated only as an ObjectId; Session 8 retrofits existence/ownership checks on those routes, and Session 14 swaps in the real portfolio read for Session 12's empty default. The seam pattern is codified in Session 1 so the swaps are mechanical. |
| F10 | **Skill-category source document missing.** | task instruction; §8 item 3 | Assumption A4: concrete default list planted in Session 17, flagged for confirmation. Data-only; no schema impact. |
| F11 | **Feed indexes incomplete; text+geo conflict.** §3 indexes don't cover the feed's filter combinations and a single text index and single 2dsphere are mutually exclusive with combined use. | §2.8, §3 | Session 6 uses regular indexed filters; `explain()`-driven index review and the text-vs-geo decision are part of Session 19 (security & performance). |
| F12 | **`verifications` state machine unreachable.** The verify transaction inserts `verifications` already-`verified` and rejection inserts already-`rejected`; no code path ever creates a `pending` row. | §5, §2.13 | Simplify (documented in Session 11 specs): `verifications` documents are created terminal (`verified` on accept, `rejected` on reject, kept for audit and `(organizationId, status)` stats). |
| F13 | **Multiple live tokens per `(userId, type)`.** TTL cleans up eventually but leaves confusing states and is a primitive oracle. | §2.1, §3 | Assumption A11: issuing a new token deletes prior unexpired rows of same `(userId, type)` (Session 2). |
| F14 | **Admin seed script appears twice** (§2.1, §7, and this task's final seed session). | §2.1, §8 item 2 | Session 2 builds only the seed-ready infrastructure (roles enum, service-level admin-capable user creation, `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env.example`); the actual `seed:admin` script ships once, in Session 17. |
| F15 | **E2E core loop depends on external trigger + admin.** `published → in_progress`, `accepted → active` come only from the scheduler job, and org verification needs admin approval (P3). | §5, §2.21 | Session 18's E2E drives the /verify loop with `startDate` in the past + a direct `POST /internal/jobs/run` (this also exercises the endpoint), and approves the org via the admin route as the seeded admin. |
| F16 | **Review write-path ordering.** The verify transaction writes `reviews` while the reviews module/change is P2 (Session 13) — the Model wouldn't exist at Session 11, violating §1 ownership. | §1, §2.16, §5 | Pragmatic ownership split, applied in Sessions 11/13: Session 11 defines the `Review` schema/model + the in-transaction write (its specs MODIFY capability `reviews`); Session 13 adds the three review controllers and reliability. This is the only sanctioned split of a collection's model from its controllers. |
| F17 | **Media upload purpose not validated end-to-end.** The upload body carries `size` from the client, but the file never passes through the backend (presigned). | §2.11, §7 decision 3 | Session 8's `confirm` step re-reads size/mime from the storage provider and rejects mismatches; `size` in the upload body is advisory only. |
| F18 | **No test/deploy/seed scaffolding is defined anywhere** (Mongo-transaction test rig, seed data, Swagger, Atlas/render wiring). | whole | Sessions 1 (test rig + Swagger wiring), 17 (seed), 19 (perf/security), 20 (deploy), 21 (docs). |

No other blocking issues. Minor notes intentionally left as-is: re-apply after `accepted → withdrawn` is allowed by the partial unique index (§3) and matches the state machine; `applicationDeadline` is enforced at apply *and* accept time (F3).

---

## 3. Human-only checklist (things you must do yourself)

Nothing below blocks Sessions 1–17: every session is runnable with local/in-memory fallbacks and mocked providers in tests. Each item's "first needed" marks the first session that *wants* the real service. Do not create accounts for services before the session that needs them; service keys change and trials expire.

### 3.1 MongoDB Atlas (free M0) — produces `MONGO_URI`
1. Go to <https://www.mongodb.com/cloud/atlas/register> and create a free account (no card).
2. Create a project → "Build a Cluster" → choose the **M0 free** (shared) tier, any region close to you (e.g. AWS `eu-central-1`), cluster name e.g. `basmatak`.
3. **Database Access** → Add New Database User: username `basmatak`, generate+save a strong password, role `Atlas admin`.
4. **Network Access** → Add IP Address `0.0.0.0/0` (open; fine for MVP, revisit in Session 19).
5. Cluster → **Connect** → *Connect your application* → copy the connection string and substitute the password and add the database name:
   `mongodb+srv://basmatak:<password>@basmatak.<xxxxx>.mongodb.net/basmatak?retryWrites=true&w=majority`
- **Env var it produces:** `MONGO_URI`.
- **First needed:** Session 1 (foundation). **Fallback:** leave `MONGO_URI` unset → the app uses `mongodb://127.0.0.1:27017/basmatak` (needs a local `mongod`, or start it once: `npx mongodb-memory-server` in dev). All automated tests run on in-memory replica sets regardless.

### 3.2 Brevo (free SMTP) — produces `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
1. Go to <https://www.brevo.com> → free signup (300 emails/day, no card). (Alternative: a **Gmail app password** — same five vars with `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=465`, `MAIL_SECURE=true`.)
2. **SMTP & API → SMTP** → enable SMTP it may take a day in test mode; read off: SMTP server `smtp-relay.brevo.com`, port `587`, login (your email), and **generate an SMTP key** (that's `MAIL_PASS`).
3. Confirm at least one sender address (e.g. `no-reply@basmatak.<domain>` or use Brevo's default `from` on the senders page *and* verify it) → that is `MAIL_FROM`.
- **Env vars it produces:** `MAIL_HOST`, `MAIL_PORT` (587), `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`.
- **First needed:** Session 2 (auth email). **Fallback:** leave the `MAIL_*` vars unset → `MailService` logs the rendered email to the console and `EMAIL_VERIFICATION_REQUIRED=false`; tests inject a fake mailer.

### 3.3 Supabase (free storage) — produces `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`
1. Go to <https://supabase.com> → sign up → **New project** (e.g. `basmatak-media`), pick a region, save the database password.
2. Open **Project Settings → API**: copy **Project URL** (`https://<project>.supabase.co`) and the **anon/public** and **service_role** keys.
3. **Storage → New bucket** named `media`, set *Public bucket* to **off**. (The project pauses after a week idle; the Session 13 job tick makes a tiny storage call each run to keep it warm.)
- **Env vars it produces:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (client-side presigning), `SUPABASE_SERVICE_ROLE_KEY` (server-side meta/confirm), `SUPABASE_BUCKET=media`.
- **First needed:** Session 8 (media). **Fallback:** `STORAGE_PROVIDER=local` → dev-only implementation writing to `./storage` (gitignored), signed URLs faked; perfect for every session before deploy.

### 3.4 Render (free web service) — produces your deploy URL / `PORT`
1. Go to <https://render.com> → free signup (no card).
2. **Do this only in Session 20** (deployment config is written there; running `npm run start:prod` locally works earlier).
3. New **Web Service** → point at your repo branch → Runtime **Node**, Build command `npm ci && npm run build`, Start command `npm run start:prod`, Instance **Free**. Add to **Environment**: every var from `.env` (`MONGO_URI`, all `MAIL_*`, `JWT_*`, `STORAGE_*`, `JOBS_KEY`, `CORS_ORIGIN`, `PUBLIC_BASE_URL`), and `NODE_ENV=production`.
4. Render injects `PORT` itself; the app reads `process.env.PORT`.
- **Env vars it produces:** your `https://<service>.onrender.com` (use as `PUBLIC_BASE_URL`); `PORT` is provided by Render. **First needed:** Session 20. Nothing before it needs Render.

### 3.5 External scheduler (free) — produces nothing, requires `JOBS_KEY`
1. **Primary — cron-job.org:** <https://cron-job.org> → free signup (no card) → **Create cronjob**: URL `POST https://<your-service>.onrender.com/api/v1/internal/jobs/run`, add header `X-Jobs-Key: <JOBS_KEY>`, schedule every 15 minutes.
2. **Alternative (no third party) — GitHub Actions:** commit `.github/workflows/keep-alive.yml` with `schedule: cron: '*/15 * * * *'` (cron-job.org timezone caveats avoided) that curls the same endpoint with `JOBS_KEY` as a repository secret. This also pings the sleeping Render host so cold starts are rare.
- **First needed:** Session 20. Until then, Sessions 13 and 18 call `POST /internal/jobs/run` directly.

### 3.6 Local secrets (any time before Session 2)
Generate and put in `.env`:
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JOBS_KEY` via
`node -e "for (const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','JOBS_KEY']) console.log(k+'='+require('crypto').randomBytes(32).toString('hex'))"`

---

## 4. Sessions

Conventions used below: "verify" always includes `openspec validate <change>` + `openspec status --change <change>` from the repo root, and from `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. The unique change name is shown in the session heading; the runner in §5 uses it.

---

### Session 0 — bootstrap
**Phase:** P0 · **Change:** none (no OpenSpec change) · **Depends on:** —

**Objective.** Create the `/backend` NestJS workspace with no nested git repo, base tooling and docs, wire the OpenSpec project context so every later authoring session sees the inventory's constraints, and set up the git repo all later commits land in.

**In scope**
- `git init` at repo root (no remote). Root `.gitignore` + `/backend/.gitignore`.
- Scaffold `/backend` via the Nest CLI, `--skip-git`, `--strict` (TypeScript strict), npm packages.
- `.env.example` with every env var name used in later sessions (values blank with one-line comments). `README.md` for /backend (one page: stack, run, test, link to this roadmap and the inventory).
- Wire `openspec/config.yaml`: fill the `context:` block (see checklist) with stack/free-tier constraints.
- Confirm OpenSpec CLI version 1.5.0 and the verb-first commands (`openspec new change`, `openspec validate`, `openspec archive`, `openspec status`, `openspec instructions`) are what later sessions use (§5 proves them).

**Out of scope.** Any NestJS module or schema, `.env` (real, gitignored), the frontend folder, moving/editing `backend-inventory.md`.

**Packages & env vars.**
- Dev deps already produced by the Nest scaffold (`jest`, `supertest`, `ts-jest`, eslint, prettier, `ts-node`, `tsconfig-paths`).
- No new runtime packages this session. `.env.example` declares (blank, commented): `PORT`, `NODE_ENV`, `MONGO_URI`, `CORS_ORIGIN`, `PUBLIC_BASE_URL`, `LOG_LEVEL`, `SWAGGER_ENABLED`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `JOBS_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `EMAIL_VERIFICATION_REQUIRED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLISH_GATE_ENABLED`.

**Task checklist**
1. `npx @nestjs/cli new backend --skip-git --package-manager npm --strict` from the repo root; confirm no `.git` exists inside `backend`.
2. `git init` at the root; add root `.gitignore` (`node_modules/`, `.env`, `dist/`, `storage/`, `coverage/`, `.DS_Store`) and a matching `/backend/.gitignore` (Nest default + `.env`).
3. Add `docs/ROADMAP.md` and `backend-inventory.md` to the root `.gitignore`? No — keep them tracked; instead confirm they are not ignored.
4. Create `/backend/.env.example` with the full var list above, each with a `# ` comment (names exact, values blank).
5. Write `/backend/README.md` (stack, prerequisites, `npm run start:dev`/`test`/`build`, pointer to `docs/ROADMAP.md` and root `backend-inventory.md`).
6. Set `app.setGlobalPrefix('api/v1')` in `src/main.ts` and a GET `/api/v1/health` in a bootstrap-only controller returning `{ status: 'ok', version }` (used by Render + scheduler warm-ups). Enable `CORS` from `CORS_ORIGIN` and JSON body limit `1mb` defaults.
7. Edit `openspec/config.yaml`: `schema: spec-driven` stays; add `context: |` with: stack, "source of truth: backend-inventory.md at repo root", free-tier rules (no Redis/queues/push/SMS; in-memory throttler; mongodb-backed notifications; external scheduler hits `POST /internal/jobs/run`), conventions (global prefix `api/v1`, cursor pagination, StatusTransitionService, the three Mongo transactions, `StatusTransitionService`, roles, DTO `whitelist+forbidNonWhitelisted`), phases P1/P2/P3, and "extend a capability only via MODIFIED deltas; new concepts via ADDED". Add `rules: proposal: keep under 400 words and scoped to the roadmap session; tasks: chunks finishable in one session`.
8. Run the scaffold's build/lint/test once to prove the baseline is green; commit.

**Tests to write.** None yet — this session only proves `npm test` passes on the scaffold and the /health endpoint responds in `test:e2e`.

**Acceptance criteria & verification**
- `/backend` exists, is not a git repo itself; the root is a git repo.
- `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` all pass from `/backend`.
- `GET /api/v1/health` returns `{ status: 'ok' }` in the e2e test.
- `openspec doctor` reports the root healthy and `openspec context` shows the new `context:` text.
- Verify: `cd backend; npm run build; npm run lint; npm test; npm run test:e2e` and `openspec doctor; openspec context`.

**Commit message.** `chore: bootstrap NestJS backend, roadmap and OpenSpec project context`

---

### Session 1 — foundation
**Phase:** P1 · **Change:** `foundation` · **Depends on:** S0

**Objective.** Everything that is cross-cutting: config, Mongoose wiring, common guards/filters/pipes, the `StatusTransitionService`, audit interceptor, settings module, `@nestjs/event-emitter`, throttler, Swagger wiring, and the `/internal/jobs/run` endpoint with its handler registry (the "extension seam" home). After this session every later module "plugs in" without re-inventing core.

**In scope**
- ConfigModule (env + `.env`), `Logger` service with `LOG_LEVEL`.
- Mongoose root connection, `GlobalModule` registering a base schema options (timestamps, `versionKey:false`, `toJSON` transforms ObjectId → string), a `Paginated`/cursor helper, a typed `CastError → 400` filter, a global `HttpExceptionFilter` producing `{ statusCode, code, message, details? }` with `UPPER_SNAKE` business codes.
- `RolesGuard`/`Public` decorator and a reusable `CurrentAccount` (user + role) accessor; `SuspendedGuard` (rejects `users.status=active|suspended` accordingly).
- `StatusTransitionService`: `assert(entityType, entityId, from, to, actor)` → validates against a per-entity whitelist map, writes `status_histories`, returns the entry. Whitelists are registered by owning modules (Sessions 6,7,10,11); empty map now.
- `AuditInterceptor`: writes `audit_logs` for `Admin`, `PATCH/DELETE` on org/volunteer resources, and every admin action.
- `SettingsService` over `system_settings` (cache per-key, TTL 30s) + `AdminSettingsController` **deferred to Session 16** — S1 exposes only the service.
- Throttler (default `THROTTLE_TTL`/`THROTTLE_LIMIT`; controller-level `@Throttle` used by later sessions for login/forgot/resend).
- `@nestjs/event-emitter` GLOBAL_EVENT bus; document the named events used across the app (`application.created`, `application.accepted`, `application.rejected`, `application.withdrawn`, `submission.submitted`, `submission.verified`, `submission.rejected`, `participation.withdrawn`, `participation.removed`, `opportunity.cancelled`, `opportunity.started`, `org.verification.updated`, `publish-gate.locked`).
- Job runner: `POST /api/v1/internal/jobs/run` header `X-Jobs-Key` (constant-time compare, value from `JOBS_KEY`), idempotent tick that reads `JobRegistry.handlers[]` and runs them with `await Promise.allSettled`; single-flight via a per-process mutex; returns `{ ok, ran, results }`. **Seam:** `JobRegistry` is public so Sessions 6, 7 and 13 register handlers.
- **Seam conventions (documented in `design.md`):** when a module needs a capability owned by a later session, it depends on an interface + default inert implementation provided here in `src/common/seams/` — specifically a `PublishGateService` (S6, replaced S13), a `PortfolioQueryService` (S12, replaced S14), and a `MediaOwnership` check helper (S4/S5, filled by S8). Name the seams and their default behaviors explicitly.
- Swagger wiring (`@nestjs/swagger`) behind `SWAGGER_ENABLED`; tag groups per module.

**Out of scope.** Any business module/schema except the three core collections; real job handlers (registry is empty until S6); admin endpoints (S15/S16).

**Inventory references & coverage.** §0 (conventions), §1 items 1–2, §2.21 (endpoint only), §3 `status_histories`, `audit_logs`, `system_settings`, §6 (guard rules), §8 item 1. Routes: `POST /internal/jobs/run`, `GET /api/v1/health`. State transitions: none (registry empty).

**Packages & env vars.**
- `npm i @nestjs/config @nestjs/mongoose mongoose @nestjs/throttler @nestjs/event-emitter helmet class-validator class-transformer @nestjs/swagger`
- `npm i -D mongodb-memory-server`
- Env vars used: `PORT`, `NODE_ENV`, `MONGO_URI`, `LOG_LEVEL`, `SWAGGER_ENABLED`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `JOBS_KEY`, `CORS_ORIGIN`.

**Task checklist**
1. Create `test/utils/test-db.ts`: starts a `MongoMemoryServer` with `instance: { replSet: { count: 1 } }`, yields a `mongoose.Connection`; a `TestApp` helper bootstraps a Nest app with `Test.createTestingModule` and `MongooseModule.forRootAsync` pointed at the memory server. This is the *only* DB rig used by every unit+e2e test from here on.
2. Implement global infra module (config, logger, mongoose root, throttler, event emitter, helmet).
3. HTTP exception filter + `CastError→400` + validation pipe config (`whitelist`, `forbidNonWhitelisted`, `transform`).
4. Guards: `RolesGuard` (role claim from a `JwtPayload` injected by passport — S2 wires real tokens; guard reads a `req.token` placeholder set by an early `AuthPlaceholderGuard` seam), `Public` decorator, suspended check.
5. `StatusTransitionService` + `status_histories` model + per-module whitelist registry.
6. `AuditInterceptor` + `audit_logs` model.
7. `SettingsService` + `system_settings` model (no controller).
8. `JobRegistry` + internal jobs controller + idempotent tick.
9. Write the three seam interfaces with inert defaults.
10. Swagger init (documented in `design.md`; live only when `SWAGGER_ENABLED=true`).
11. `.env.example`: fill in the values/comments for this session's vars (others stay blank).

**Tests to write.**
- Unit: `StatusTransitionService` (valid transition writes history, invalid throws `INVALID_STATUS_TRANSITION`), `SettingsService` cache/upsert, job mutex (concurrent `run` calls execute handlers once).
- E2E: `/internal/jobs/run` rejects missing/wrong `X-Jobs-Key`; with correct key + a registered test handler it runs and is idempotent; `400` unknown ObjectId route; error shape `{ statusCode, code, message }`.
- **MongoDB transactions are proven by the replica-set `mongodb-memory-server` rig itself**: a test that runs `connection.startSession()` + `withTransaction` against the in-memory replset (this is the green light for S7/S11 to rely on it).

**Acceptance criteria & verification**
- No business logic beyond core; seams compile and default to inert behavior.
- All core infra tests green against the replica-set memory server.
- Unit + e2e pass: `npm run build && npm run lint && npm test && npm run test:e2e`; `openspec validate foundation` → valid; `openspec status --change foundation` → all artifacts done.

**Commit message.** `feat(foundation): common core, status transitions, job runner, seams, test DB rig`

---

### Session 2 — auth-and-users
**Phase:** P1 · **Change:** `auth-and-users` · **Depends on:** S1

**Objective.** Authentication end to end: register (volunteer/organization), login, short-lived access + rotated hashed refresh tokens in `sessions`, email verification and password reset via `verification_tokens` + `MailService` (Brevo SMTP behind an interface), forgot/reset/change-password, logout(s), and `/users/me` CRUD. Seed-ready admin infra (final script lives in S17).

**In scope**
- `users`, `sessions`, `verification_tokens` models and indexes (unique email, sparse unique phone, TTL on `expiresAt`).
- All routes from §2.1 and §2.2 except the P2 ones (`/auth/logout-all`, `/users/me/sessions*` → Session 13).
- `MailService` interface: `sendVerificationEmail`, `sendPasswordReset`, `sendWelcome?`; default `SmtpMailService` (nodemailer, `MAIL_*`), a `LogMailService` when `MAIL_HOST` unset (writes the rendered mail to the logger), and a test double.
- JWT strategy (`@nestjs/passport`, `passport-jwt`) providing `req.user` with `sub, role, sessionId`; refresh flow rotates the token hash and expiry in `sessions`; logout deletes the session; password-reset revokes all sessions.
- `EMAIL_VERIFICATION_REQUIRED` gate: when true, apply/publish/submit guards also require `users.emailVerified`.
- Twice-stricter throttles on `/login`, `/forgot-password`, `/resend-verification`.
- Seed-ready infra only: roles enum `volunteer|organization|admin`, admin-capable `UsersService#createUser(role)` and documented `ADMIN_EMAIL`/`ADMIN_PASSWORD` env placeholders (consumed in S17). No `seed:admin` script yet (F14).

**Out of scope.** Phone/SMS, 2FA, Google login, session listing, `/auth/logout-all`, admin routes, the actual admin seed script, org verification flows (S5).

**Inventory references & coverage.** §2.1, §2.2 (minus P2), §3 (`users`, `sessions`, `verification_tokens`), §0 (auth, throttler), §1 item 4 (users), §7 (admin-from-env mechanism). Routes: `POST /auth/register/volunteer`, `/register/organization`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/change-password`, `GET /auth/me`; `GET/PATCH/DELETE /users/me`. State transitions: user `status` `active|suspended|deleted` (set/read, not yet mutated by any route here).

**Packages & env vars.**
- `npm i @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt nodemailer` and `npm i -D @types/passport-jwt @types/nodemailer`
- Env vars (add to `.env.example`): `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (15m), `JWT_REFRESH_TTL` (30d), `EMAIL_VERIFICATION_REQUIRED` (false), `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`.
- Note: if `bcrypt` native build fails on Windows use `bcryptjs` (same API) — do not pin a second solution.

**Task checklist**
1. `users`, `sessions`, `verification_tokens` schemas + indexes (optimised: `partialFilterExpression` for `phone`).
2. `PassportModule`-based JWT strategy and `JwtAuthGuard`; `RolesGuard` wired to it so `@Roles('admin')` works (replacing S1's placeholder).
3. `AuthService`: register (transactionally user + `volunteer_profiles`/`organizations` creation hooks — S4/S5 own the profile/org shapes, so S2 calls a `RegistrationExtrasService` seam with a no-op default that S4/S5 implement), login (bcrypt compare, issue tokens, insert `sessions` with SHA-256 of refresh token), refresh (rotate), logout, verify-email (consume token, set `emailVerified`), resend (rate-limited, invalidate prior tokens per A11), forgot/reset (token type `password_reset`, revoke sessions on reset), change-password, `/auth/me` (user + role + embedded own org for org accounts via a `OrganizationLookup` seam → S5).
4. `MailService` trio (smtp/log/test-double) and templates (HTML, Arabic/French-safe plain text; French default, configurable later).
5. Controller + DTOs with `class-validator`; `forbidNonWhitelisted`; role not settable in DTOs (register routes have dedicated role paths).
6. `UsersController` (`me` GET/PATCH/DELETE soft-delete with `status=deleted`; email/phone change re-triggers verification per §2.2).
7. Unit tests: token rotation rewrites `sessions`; hash stored not plain; bcrypt compare; throttle config; reset revokes sessions; A11 single-active-token.

**Tests to write.**
- Unit: `AuthService` (register/login/refresh/rotate/logout/reset flow, token invalidation), `MailService` log transport output.
- E2E (memory DB): full register→verify→login→refresh→me→logout; forgot→reset→old refresh rejected; change-password; verify-email consuming token once (replay fails, 400/410); `EMAIL_VERIFICATION_REQUIRED=true` blocks nothing yet (no publish/apply routes exist; guard merely unit-tested). Unverified-browse-only applies once S6+ routes exist — e2e asserts the guard's behavior via a probe route.

**Acceptance criteria & verification**
- All §2.1/§2.2 (P1 part) routes exist and behave per notes.
- Tokens rotate; refresh hashes stored; sessions TTL active.
- Login rate limiting returns 429 after N attempts (configurable).
- Verify: build/lint/test/e2e green; `openspec validate auth-and-users`.

**Commit message.** `feat(auth): JWT refresh sessions, email verification, password reset, users/me`

---

### Session 3 — reference-data
**Phase:** P1 · **Change:** `reference-data` · **Depends on:** S1

**Objective.** Locations (58 wilayas + municipalities) and skills (categories + skills) as seeded reference data with public read endpoints and admin-maintenance endpoints (admin role guard from S2), plus idempotent seed scripts and the canonical `slugify` pipeline (A12).

**In scope**
- `locations`, `skill_categories`, `skills` models + indexes (§3).
- `GET /api/v1/locations/wilayas`, `GET /api/v1/locations/wilayas/:wilayaId/municipalities` (ordered, cacheable via settings TTL headers).
- `GET /api/v1/skill-categories` (active, ordered by `order`), `GET /api/v1/skills?categoryId=&q=`.
- Admin CRUD per §2.3/§2.4: `POST/PATCH /admin/locations(/:id)`, `POST/PATCH /admin/skill-categories(/:id)`, `POST/PATCH /admin/skills(/:id)` — implemented here (not in S15) because the inventory lists them under these P1 modules; the admin role guard already exists. Deactivate-not-delete for skills/categories (`active:false`).
- Seed scripts `seed:locations`, `seed:skills` (idempotent upserts by `code`/`slug`). Location dataset: the 58 wilayas (codes 01–58, `name_ar`, `name_fr`) + municipalities (official administrative codes, `name_ar`, `name_fr`), stored as a TS data file in `src/seed-data/`. If offline, fetch from a well-known open Algerian admin-divisions dataset and record the source + date in the file header (per A4, data quality is confirmable later).
- Skill categories/skills: plant the A4 default list + a starter set of skills per category (idempotent).

**Out of scope.** Frontend location pickers; 2dsphere/geo stuff (no coordinates needed for locations — the index is on opportunities); translations beyond ar/fr; any other module.

**Inventory references & coverage.** §2.3, §2.4, §3 (`locations`, `skill_categories`, `skills`), §8 item 3. Routes listed above. State transitions: `active` toggle only.

**Packages & env vars.**
- `npm i slugify` (A12)
- No new env vars.

**Task checklist**
1. Location schema `{ code, type: 'wilaya'|'municipality', parentCode?: string, nameAr, nameFr, legacyId? }` + indexes `(type, parentCode)`; skill schemas with slugs, `order`, `active`.
2. Public read controllers + DTOs; endpoint caching headers.
3. Admin maintenance controllers (role-gated) — deactivate semantics.
4. `src/seed-data/locations.ts`: complete 58 wilayas + municipalities dataset (source header).
5. `src/seed-data/skills.ts`: categories (A4 list) + default skills (≥3/category).
6. `src/scripts/seed.ts` dispatcher (`--only locations|skills`), idempotent via `bulkWrite` upserts; npm scripts `seed:locations`, `seed:skills`, `seed:all`.
7. Unit tests for `slugify` collision retry (A12) and seed idempotency on double-run.

**Tests to write.**
- Unit: slug generation + retry-on-collision (mocked collection `E11000`), upsert idempotency.
- E2E: seed wilayas, then `GET /locations/wilayas` = 58; `GET /locations/wilayas/16/municipalities` non-empty; `GET /skill-categories` ordered+active; `/skills?categoryId=` filter; guest can read all; admin POST/PATCH create/update and deactivate hides from public; non-admin gets 403.

**Acceptance criteria & verification**
- Seeding is repeatable (run twice → same counts).
- Public reads work for guests; admin writes rejected for non-admins.
- Verify: build/lint/test/e2e + `openspec validate reference-data`; run `npm run seed:locations` and `npm run seed:skills` locally first.

**Commit message.** `feat(reference-data): wilayas, municipalities, skill catalog with idempotent seeds`

---

### Session 4 — volunteer-profiles
**Phase:** P1 · **Change:** `volunteer-profiles` · **Depends on:** S2, S3

**Objective.** The volunteer's private profile area: profile, skills, availability schedule, dashboard — and the `publicProfile` flags that the later public-discovery session reads. Complete the S2 `RegistrationExtrasService` seam so registration also creates `volunteer_profiles`.

**In scope**
- `volunteer_profiles`, `volunteer_skills`, `volunteer_availability` models + indexes (§3, incl. unique `username`).
- All `§2.5` routes: `GET/PATCH /volunteers/me`, `PATCH /volunteers/me/public-settings`, `GET /volunteers/me/dashboard`, skills CRUD (`volunteers/me/skills[/:skillId]`), `GET/PUT /volunteers/me/availability`.
- Registration hook: volunteer registration creates `users` + `volunteer_profiles` (S2 seam).
- `avatar`/`banner` accept `mediaId` (ObjectId-format validated now; ownership/existence enforced by S8 — F9).
- Public-read seams (inert until S12): `getPublicProfile(slug)`, `listPublicTalents(filters)`, `getPublicExperiences`, `getPublicPortfolio` with the A5 flag logic and a `404 when enabled=false` contract.
- Dashboard computation: profile completion %, stats from `volunteer_profiles.stats` (populated by S11), latest verified experience.

**Out of scope.** Public endpoints (S12), media storage (S8), stats computation (S11), portfolio.

**Inventory references & coverage.** §2.5, §6 (owner-only), §3 (three collections), §8 item 4. Routes: all under `/volunteers/me(...)`. State transitions: none.

**Packages & env vars.** None new.

**Task checklist**
1. Schemas + unique indexes (`userId`, `username`, `(volunteerId, skillId)`, `volunteerId`).
2. `VolunteersService` (profile get/patch: names, bio, birthDate, location `{ wilayaId, municipalityId }`, avatar mediaId; `public-settings` mutates `publicProfile`).
3. Mentor skills CRUD (`skillId, level, yearsOfExperience, isPrimary`; validates skill exists + active; disallows duplicates; one `isPrimary` per profile).
4. Availability `PUT` replace-whole-schedule; `GET`.
5. Dashboard service (completion %, stats read, latest verified experience) + route.
6. Implement S2 seam `RegistrationExtrasService` for volunteers.
7. Public-read seam returns inert-but-correct shapes (empty lists, `404` when disabled) per A5.
8. E2E and unit coverage below.

**Tests to write.**
- Unit: completion-% calculation; `isPrimary` uniqueness; availability replacement is atomic; public-settings toggle does not leak other fields.
- E2E: register volunteer → `/volunteers/me` exists; PATCH updates bio/location; skills add/update/delete + duplicate rejection; availability PUT/GET; dashboard returns stats (zeros) + completion; a second volunteer cannot GET/PATCH the first's `/volunteers/me` (403 via ownership guard on resolved account).

**Acceptance criteria & verification**
- Volunteer owns exactly their own profile/skills/availability.
- All §2.5 routes green; registration creates profile.
- Verify: build/lint/test/e2e + `openspec validate volunteer-profiles`.

**Commit message.** `feat(volunteers): profiles, skills, availability, dashboard and privacy flags`

---

### Session 5 — organizations
**Phase:** P1 · **Change:** `organizations` · **Depends on:** S2, S3

**Objective.** Organization accounts: the org page tied one-to-one to its login (`organizations.userId` unique), public org read routes, org internals (`/me`), document submission for verification, and resubmission after rejection (F1) so the state machine is `pending → verified | rejected → pending`.

**In scope**
- `organizations`, `organization_verifications` models + indexes (§3, §7 schemata; F1).
- Routes: `GET /organizations`, `GET /organizations/:slug`, `GET /organizations/:slug/opportunities` (published only; returns empty until S6), `GET/PATCH /organizations/me`, `POST /organizations/me/verification` (documents as `mediaId[]`, sets/keeps `pending`; allowed from `pending` (update) and `rejected` (→ pending, F1); allowed only for email-verified account per A10), `GET /organizations/me/verification` (latest status + rejectionReason if any).
- Registration hook: org registration creates `users` + `organizations(userId)`.
- Public-org seam for S12 (`getPublicOrganization(slug)` → only when `verificationStatus=verified` and `status=active`).

**Out of scope.** Admin approve/reject (S15), publish gate (S13), publishing itself (S6), logo handling beyond storing a `mediaId`.

**Inventory references & coverage.** §2.7, §5 (`organizations.verificationStatus` + F1 fix), §3 (two collections), §9 (single-account, `userId` unique), §7. Routes: as listed. State transitions: `verificationStatus: pending → verified|rejected → pending` (resubmit).

**Packages & env vars.** None new.

**Task checklist**
1. Organization schema with `userId` unique, `slug` unique, `verificationStatus`, `status`, `reliability` placeholder (used S13).
2. `organization_verifications` schema (orgId, status, documents `mediaId[]`, rejectionReason, submittedAt, decidedAt, decidedBy).
3. `OrganizationsService`: slug generation (A12), public finder (verified + active), `me` owner resolution from token.
4. Verification document submission (state machine per F1) + latest-status read.
5. Implement S2 `RegistrationExtrasService` for organizations.
6. Order controllers: `/organizations/me` and `/organizations/me/verification` **declared before** `/organizations/:slug` else the route is shadowed (§2.7).
7. Public seam shapes (empty opportunities until S6).

**Tests to write.**
- Unit: slug retry; state machine: `pending→rejected→pending` allowed, `pending→verified` only by admin (tested S15), past-due documents can be updated.
- E2E: register org → `/organizations/me` exists; POST verification with fake ObjectId docs (S8 will harden) → pending; public `GET /organizations/:slug` 404 while pending; after seed/manual `verified` it lists; `GET /organizations` only verified+active; non-owner 403 on `/me`.

**Acceptance criteria & verification**
- One org per account enforced by unique `userId`; resubmission path works (F1).
- Public routes hide non-verified orgs.
- Verify: build/lint/test/e2e + `openspec validate organizations`.

**Commit message.** `feat(organizations): one-account org pages and verification document flow`

---

### Session 6 — opportunities
**Phase:** P1 · **Change:** `opportunities` · **Depends on:** S4, S5

**Objective.** The opportunity (task) entity: creation as draft, publication (subject to the publish-gate seam), the full `draft → published → in_progress → completed` / `→ closed | cancelled` lifecycle, positions with `filledCount`, public feed + details, org internals, and the `startDate` job handler that activates opportunities and participants.

**In scope**
- `opportunities` model (positions embedded, `requiredCount`, `filledCount`, `requiredSkills`) + indexes (§3: unique slug, `(status,startDate)`, `(organizationId,status)`, 2dsphere `location.coordinates`, text on title/description, `positions.requiredSkills.skillId`).
- Public: `GET /opportunities` (feed with filters `q, categoryId, skillId, wilayaId, municipalityId, from, to, hasOpenPositions`; only `published*`), `GET /opportunities/:idOrSlug` (published only; owner org may see own drafts via `me` route).
- Org: `POST/GET /organizations/me/opportunities`; `PATCH/DELETE /opportunities/:opportunityId`; `POST /opportunities/:opportunityId/{publish,close,cancel,complete}`; positions CRUD under `/opportunities/:opportunityId/positions...` with the `requiredCount ≥ filledCount` rule and draft-only-delete and published-with-no-accepted-participants edit rule; `GET /opportunities/recommended` seam (returns empty now, rules in S12).
- Publish gate seam: publish calls `PublishGateService#evaluate(org)`; default (until S13) returns unlocked per A7; if `PUBLISH_GATE_ENABLED=true` and the gate says locked → `PUBLISH_GATE_LOCKED` for the demo path.
- **Job handler** (S1 registry): `opportunityStartTicker`: find opportunities `{ status: 'published', startDate: { $lte: now } }` → move each to `in_progress` and set their `accepted` participants `active` (idempotent), emitting `opportunity.started`.
- Lifecycle route guards: only `verified`+`active` orgs may publish (§7 decision 7, §6); only status-valid transitions via `StatusTransitionService`; `close`/`cancel` from `published|in_progress`; `complete` from `in_progress`; applying stops at `applicationDeadline` (checked in S7).

**Out of scope.** Applications (S7), recommended-engine rules (S12), gate math (S13), the `in_progress`-notification (S13), admin force-close (S16).

**Inventory references & coverage.** §2.8, §3 (opportunities), §5 (opportunities state machine), §6, §7 (decisions 1, 4, 5, 7). Routes: all listed above. State transitions: the full opportunities machine; `accepted → active` (job).

**Packages & env vars.**
- None new.
- Env var: add `PUBLISH_GATE_ENABLED` (default false) to `.env.example`; `system_settings` key `publishGate.maxPendingOpportunities` (default 3) created by the settings service on boot.

**Task checklist**
1. Schema with nested position sub-schema; indexes as listed.
2. Feed query pipeline (filters → `published` filter; `hasOpenPositions` = exists position with `filledCount < requiredCount`); cursor pagination (default 20, max 50).
3. Detail/detail-by-slug; `me` list all statuses.
4. Create-with-positions; PATCH limited fields (before publish everything; after publish a small editable set); DELETE draft-only.
5. Publish/close/cancel/complete transitions through `StatusTransitionService` (whitelist registered); org-verified check on publish.
6. Positions create/patch/delete with the seat rules.
7. `opportunityStartTicker` job handler + idempotency.
8. Recommended route wiring to seam (empty until S12).
9. E2E coverage below.

**Tests to write.**
- Unit: transition whitelist; seat rules on position patch/delete; job handler idempotency on double-run.
- E2E: create draft (org) → publish → public feed shows it; close → hides from feed? (published only, so `closed` disappears); cancel with participants (S7 later; unit-test notification event emission here); non-verified org publish → 403 `ORG_NOT_VERIFIED`; `startDate` past + job run → status `in_progress` + participants activated (participants seeded manually here); seat guard `filledCount` never below `requiredCount`; cursor pagination max 50.

**Acceptance criteria & verification**
- A verified+active org can publish; a pending one cannot (403).
- The job tick transitions opportunities and activates participants exactly once.
- Verify: build/lint/test/e2e + `openspec validate opportunities`. Manually: `npm run seed:locations`, login, create+publish via API.

**Commit message.** `feat(opportunities): task lifecycle, positions, feed and startDate job tick`

---

### Session 7 — applications-and-participation
**Phase:** P1 · **Change:** `applications-and-participation` · **Depends on:** S6

**Objective.** The application loop: volunteer applies to a position, sees/cancels their applications, org accepts/rejects (accept is the first real MongoDB transaction), participants ("My Tasks") life cycle including withdraw/remove, and the second transaction for withdrawing an *accepted* application (F2). This is the session that exercises the transaction rig for real.

**In scope**
- `applications`, `task_participants` models + indexes (§3).
- Routes: apply `POST /opportunities/:opportunityId/positions/:positionId/applications` (one active application per position; open seat; open deadline; verified-email gate A10; opportunity must be `published`); `GET /applications/me?status=`; `GET /applications/:applicationId` (owner/org); `POST /applications/:applicationId/withdraw` (pending **or accepted** — accepted path is a transaction per F2); `GET /opportunities/:opportunityId/applications?positionId=&status=`; `POST /applications/:applicationId/accept` (transaction per F3); `POST /applications/:applicationId/reject` (`{ reason }`).
- Participations: `GET /participations/me?status=`; `GET /participations/:participationId` (owner/org); `POST /participations/:participationId/withdraw` (decrement `filledCount`); `GET /opportunities/:opportunityId/participants`; `POST /participations/:participationId/remove` (org, `{ reason }`).
- **Transactions** (all with `mongodb-memory-server` replset tests):
  - *Accept application* (inventory §5 + F3): assert published + deadline, increment seat via array-filtered guarded update, application→accepted, insert participant (`accepted`, or `active` if opportunity already `in_progress`), status history + notification **inside the transaction** (F4), then emit events after commit.
  - *Withdraw accepted application* (F2): application→withdrawn, matching participant→withdrawn (conditional update), `filledCount`–1.
- Participant state machine: `accepted → active` (S6 job), `completed` (S11), `accepted|active → withdrawn|removed`; a participant accepted while org already `in_progress` is created `active`.

**Out of scope.** Submissions (S10), verification (S11), stats (S11), volunteer-facing dashboards (S4), admin views.

**Inventory references & coverage.** §2.9, §2.10, §3 (`applications`, `task_participants`), §5 (machine + accept transaction, F2/F3/F4). Routes: all listed. State transitions: applications machine + participants machine.

**Packages & env vars.** None new.

**Task checklist**
1. Schemas + indexes incl. partial unique `(positionId, volunteerId)` where status in (pending, accepted).
2. Apply endpoint: dedupe via partial index (409 on duplicate live application), guards (email verified, participation not blocked, deadline, published).
3. Accept transaction implementing F3 ordering; insert participant; events.
4. Reject with reason.
5. Withdraw pending (no trans) and withdraw accepted (transaction, F2).
6. Participations withdraw (decrement filledCount) and org remove.
7. Register `application.*`, `participation.*` events (F4).
8. E2E incl. concurrency attempts.

**Tests to write.**
- Unit: state-machine whitelist; partial-index duplicate logic (simulate E11000 → business 409).
- E2E/transaction (replica-set rig): accept fills one seat and creates exactly one participant; second accept on last seat of full position fails with `POSITION_FULL`; concurrent accepts (Promise.all 2 on 1 seat) leave exactly one accepted application + `filledCount=1`; withdraw-accepted leaves no active participant and `filledCount` decremented (F2); deadline-passed apply → 410; unverified-email apply → 403; initial `accepted` participant of an already-`in_progress` opportunity is created `active`.

**Acceptance criteria & verification**
- Transactions roll back on any failure (verify a deliberately failing step in the accept transaction leaves no partial rows).
- No double-booking possible.
- Verify: build/lint/test/e2e + `openspec validate applications-and-participation`.

**Commit message.** `feat(applications): transactional accept, safe withdraw, participations`

---

### Session 8 — media
**Phase:** P1 · **Change:** `media` · **Depends on:** S1, S6

**Objective.** Media lifecycle behind the `StorageProvider` interface: presigned upload → confirm → serve/delete, external video links, visibility, and the ownership matrix from §6. Retrofit the F9 seams so `avatar`, org verification documents, and (from S10) submission evidence are validated against `media`.

**In scope**
- `media` model + indexes (§3; add `ownerId`, `submissionId`, `portfolioItemId`, `storageKey`).
- Routes: `POST /media/uploads` (Auth; body `{ filename, mimeType, size, purpose, visibility }` → `{ mediaId, uploadUrl }`, with purpose/visibility enums per F6 and the size/mime allowlist: images jpeg/png/webp ≤ 5 MB; documents pdf ≤ 5 MB; anything else 400); `POST /media/:mediaId/confirm` (owner; reads actual metadata from storage, rejects mismatch — F17); `POST /media/links` (type `link`, `url`; host allowlist `youtube.com`, `youtu.be`, `drive.google.com`); `GET /media/:mediaId` (public 404 unless auth; private → signed URL only for owner / owning-opportunity org / admin, else 403); `DELETE /media/:mediaId` (owner; `deletedAt` soft; blocked if attached to a verified experience or a non-terminal submission — F6).
- `StorageProvider` interface + `SupabaseStorageProvider` (`@supabase/supabase-js`, presigned, service-role metadata read) + `LocalStorageProvider` (`STORAGE_PROVIDER=local`, dev-only, `./storage` gitignored, fake signed URLs) + test double.
- `canReadMedia(actor, media)` helper encoding the §6 matrix.
- **Retrofit seams (F9):** volunteer avatar (`PATCH /volunteers/me`), org verification docs (`POST /organizations/me/verification`) now validate `mediaId` existence, owner, purpose, and non-deleted; expose `MediaOwnership.assertFor(mediaId, actor, purpose)`.

**Out of scope.** Video *upload* (links only), image compression (client-side per §7), portfolio-item linking (S14), frontend.

**Inventory references & coverage.** §2.11, §3 (`media`), §6 (private-media access), §7 decisions 1–3. Routes: the six listed. State transitions: none.

**Packages & env vars.**
- `npm i @supabase/supabase-js`
- Env vars: `STORAGE_PROVIDER` (`supabase` default, `local` dev), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`.

**Task checklist**
1. Media schema + enums (`purpose`, `visibility`, `type: file|link`).
2. `StorageProvider` interface + two implementations + test double (spies).
3. `MediaService` (create, confirm, link, sign, soft-delete, ownership checks).
4. Controller with the six routes + `Throttle` where sensible.
5. Retrofit F9: avatar + org documents routes now call `MediaOwnership.assertFor` (refactor those routes slightly).
6. Host-allowlist validator for links (SSRF-guard basis for S19).
7. Unit + e2e below.

**Tests to write.**
- Unit: purpose/size/mime validation; host allowlist; `canReadMedia` matrix (owner/public/admin/org-of-opportunity/stranger); confirm-mismatch rejects.
- E2E: upload → confirm → owned signed GET; stranger GET private → 403; public-visibility media readable by all auth; delete blocked for verified-experience-attached and for submitted/under_review evidence; link-only hosts accepted/rejected; avatar + org-document routes reject foreign/absent mediaId (regression over F9).

**Acceptance criteria & verification**
- No media bytes ever stored in MongoDB (prove: upload uses provider; Mongo holds only metadata).
- Ownership matrix from §6 enforced exactly.
- Verify: build/lint/test/e2e + `openspec validate media`. With no Supabase configured, tests use `STORAGE_PROVIDER=local`/double.

**Commit message.** `feat(media): storage provider, presigned uploads, links, visibility and ownership`

---

### Session 9 — notifications
**Phase:** P1 · **Change:** `notifications` · **Depends on:** S1, S2, S7

**Objective.** In-app notifications created by domain events (EventEmitter from S1): a `notifications` collection, the four §2.17 routes, and a handler registry so the events emitted by S2/S5/S6/S7 (and, later, S10/S13) translate into notifications. The handlers register at bootstrap; events with no handler are simply ignored, so sessions stay order-independent.

**In scope**
- `notifications` model + index `(userId, isRead, createdAt)`.
- Routes: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:notificationId/read`, `POST /notifications/read-all`.
- Event handlers (idempotent, safe to receive the same event twice): `application.created` (to org), `application.accepted`/`rejected`/`withdrawn` (to volunteer), `participation.removed` (volunteer), `opportunity.cancelled` (to participants), `org.verification.updated` (to org account) — for events that will be emitted later (`submission.*`, `publish-gate.locked`, `opportunity.started`) the handler is registered now against the event name, so S10/S11/S13 only need to emit.
- Read-receipt semantics: PATCH marks read only that row; notifications are per-user screens; nothing is emailed (inventory §2.17).

**Out of scope.** WebSocket/push/email notifications; notification preferences; pagination beyond cursor.

**Inventory references & coverage.** §2.17, §3 (notifications), §0 (events), §8 item 8b. Routes: the four. Collections: `notifications`. Transitions: none.

**Packages & env vars.** None new.

**Task checklist**
1. Schema + index; `NotificationsService` (create, list, unreadCount, markRead, readAll).
2. Controller + DTOs.
3. Event-handler wiring module (`NotificationsEventHandlers`) subscribing to the S1 bus for the named events; guard against double-processing and against circular writes (handler itself does not emit).
4. Ensure S7's transactional notifications (F4) do NOT also cross the bus (dedupe rule: transactional flows write directly, the bus only handles the non-transactional convenience events).

**Tests to write.**
- Unit: event→notification mapping; idempotency (same event twice → one notification).
- E2E: emit `application.created` (simulate via bus) → org sees it; volunteer accepts → notification; unread-count; mark-read; read-all; foreign user cannot read another's notification (403/404).

**Acceptance criteria & verification**
- All in-app routes behave per §2.17; unread count is cheap (index used).
- Verify: build/lint/test/e2e + `openspec validate notifications`.

**Commit message.** `feat(notifications): event-driven in-app notifications`

---

### Session 10 — submissions-verification-experiences (Part A: submissions)
**Phase:** P1 · **Change:** `submissions-verification-experiences` (shared change, Part A) · **Depends on:** S7, S8, S9

**Objective.** The volunteer reports their work: create a submission for a participation, attach evidence (media refs), edit, submit with the consent rule, and the org's verification inbox. One submission per participation, reusable on resubmission.

**In scope**
- `submissions` model (`participantId` unique, `deliverables`, `evidence` media refs, `description`, `consentConfirmed`, status) + indexes (§3).
- Routes: `POST /participations/:participationId/submissions` (one per participant, 409 on second); `PATCH /submissions/:submissionId` (`draft` edits; editing a `rejected` returns it to `draft`); `POST /submissions/:submissionId/submit` (draft→submitted; requires description + ≥1 evidence per `deliverables`; `consentConfirmed=true` when evidence includes image/video); `GET /submissions/me`; `GET /submissions/:submissionId` (owner/org); `GET /organizations/me/submissions?status=&opportunityId=` (inbox); `POST /submissions/:submissionId/start-review` (submitted→under_review; may be implicit on inbox open).
- Evidence entries validated via S8 `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')`.
- Emit `submission.submitted`.
- Status machine: `draft → submitted → under_review → approved|rejected` with `rejected → draft` (write path for `approved|rejected` lands in S11; whitelist contains the full machine now).

**Out of scope.** Verify/reject (S11), experiences (S11), reviews (S11/S13), stats (S11).

**Inventory references & coverage.** §2.12, §3 (submissions), §5 (machine), §6. Routes: the eight listed. Collections: submissions. Transitions: draft→submitted→under_review; rejected→draft (rule supported; S11 triggers rejections).

**Packages & env vars.** None new.

**Task checklist**
1. Schema + unique `participantId` and the other §3 indexes.
2. Create/patch/submit service methods with the validation rules.
3. Inbox + detail + `me` routes with org/owner scoping.
4. `start-review` transition (and optional auto-start on org inbox open).
5. Evidence #consent rule enforced at submit.
6. Event emission; notification handler already registered (S9).
7. E2E below.

**Tests to write.**
- Unit: submit validation (description, evidence-per-deliverable, consent when imagery); rejected→draft round-trip.
- E2E: participant drafts → submits → appears in org inbox `submitted`; volunteer edits a `rejected` submission → returns to `draft`; foreign volunteer can't patch; second create for same participant → 409; consent missing with image evidence → 422/400 `CONSENT_REQUIRED`.

**Acceptance criteria & verification**
- The inbox only lists the owning org's opportunities.
- One submission per participant enforced.
- Verify: build/lint/test/e2e + `openspec validate submissions-verification-experiences` (status shared with Part B; validate reports both parts valid).

**Commit message.** `feat(submissions): reporting flow, consent, inbox (part A)`

---

### Session 11 — submissions-verification-experiences (Part B: verification & experiences)
**Phase:** P1 · **Change:** `submissions-verification-experiences` (shared change, Part B) · **Depends on:** S10

**Objective.** Close the core loop: org verifies/rejects submissions, the verify transaction mints the `verifications` row, inserts a `volunteer_experiences` row with a public `verificationCode`, updates volunteer stats, optionally writes a `review`, and the public `/verify/:code` proof endpoint works. This is where "verified experience on the public profile" first becomes real and feeds Session 12.

**In scope**
- `verifications`, `volunteer_experiences` models + indexes; **`reviews` schema/model defined here** (F16 owner-split) without controllers.
- Routes: `POST /submissions/:submissionId/verify` (`{ notes?, review? }` — the §5 transaction); `POST /submissions/:submissionId/reject` (`{ reason }`); `GET /verifications/:verificationId` (owner/org); `GET /verify/:verificationCode` (public, A6); experiences `GET /experiences/me`, `GET /experiences/:experienceId` (owner), `PATCH /experiences/:experienceId/visibility` (`{ publicVisibility }`).
- **Verify transaction** (§5 + F4/F12/F16): submission `submitted|under_review` → approve; participant → `completed`; insert `verifications` (verified); insert `volunteer_experiences` (copies title/description/skills/duration, `evidenceIds`, generated `verificationCode` per A12); insert `reviews` when `review` provided; `volunteer_profiles.stats` `$inc` (`completedTasks`, `verifiedExperiences`, `volunteerHours` = duration); status histories + notifications **inside the transaction**; emit `submission.verified` after commit.
- **Reject** (non-transactional OK): `verifications` (rejected) row + submission `rejected` + reason; emit `submission.rejected`.
- `verifications` created terminal (F12).

**Out of scope.** Review routes under §2.16 (S13), reliability (S13), public profile publishing of the experience (S12 reads it), media access beyond exposure rules.

**Inventory references & coverage.** §2.13, §2.14, §5 (machines + verify/reject transactions), §4 (stats), §3 (three collections + reviews model), §7 (decision 6). Routes: the nine listed. Collections: `verifications`, `volunteer_experiences` (+ `reviews` data layer). Transitions: submissions `...→approved|rejected`; participants → `completed`.

**Packages & env vars.** None new (verification codes via built-in `crypto`; A12).

**Task checklist**
1. `verifications`, `volunteer_experiences` schemas + indexes (unique `submissionId`, unique `verificationCode`, `(volunteerId, publicVisibility)`).
2. `Review` schema/model (shared `src/reviews/review.schema.ts`), no controllers (F16).
3. `VerificationService.verify()` implementing the full transaction; inject `ClientSession`; conditional paths for `under_review`-already-reviewed (re-submits can't double-verify: submission not in `submitted|under_review` → 409).
4. `verify()` inserts optional review atomically; stats update.
5. `reject()` + reason retention in `status_histories`.
6. Experience read/visibility routes; `/verify/:code` public handler building the A6 summary (no private media).
7. Unit + e2e below (incl. a transaction-failure rollback test).

**Tests to write.**
- Unit: code generation uniqueness (collision retry, A12); stats increments; experience copies evidence.
- E2E/transaction: full happy path (draft→submit→review→verify→approved→participant completed→experience exists→`/verify/:code` returns summary with only public media); verify with `review` inserts one review (and a second submission-review attempt 409 via unique index); verify on already-approved submission 409; reject → volunteer edits → resubmits (S10 rule) → re-verified; **rollback**: force a mid-transaction failure (stubbed dependency) → no `verifications`, no experience, submission still under_review.

**Acceptance criteria & verification**
- Expected database after verify: 1 verification, 1 experience, participant completed, stats incremented, no partial rows on failure.
- `/verify/:code` public and correct.
- Verify: build/lint/test/e2e + `openspec validate submissions-verification-experiences`; then `openspec archive submissions-verification-experiences -y`.
  **Note for the runner:** this change is created in Part A (S10); Part B only *extends* it — never run `openspec new change` again.

**Commit message.** `feat(verifications): transactional verify/reject and public experience proof (part B)`

---

### Session 12 — public-discovery
**Phase:** P1 · **Change:** `public-discovery` · **Depends on:** S3, S4, S5, S11

**Objective.** Make volunteers discoverable and opportunities recommendable, all guest-safe: Talents feed, public volunteer pages gated by the A5 flags, public experiences/portfolio endpoints, the rule-based recommended feed, and replace the S6/S4 empty seams with real logic.

**In scope**
- `GET /talents` (filters `q, skillId, categoryId, wilayaId`; only `publicProfile.enabled=true`); cursor pagination.
- `GET /volunteers/:username` (404 when `enabled=false`; sections gated by `show*` flags), `GET /volunteers/:username/experiences` (only `publicVisibility=true`), `GET /volunteers/:username/portfolio` (only visibility `public`; empty until S14 via the S14 seam).
- `GET /opportunities/recommended` (Vol; rule-based: overlap of volunteer skills levels/topics + location match + `published` + open positions; plain query — no ML per §0). Replace S6's empty implementation.
- Wire `volunteer_profiles.publicProfile` flags (S4) into profile retrieval; ensure NO route here returns other volunteers' private fields.
- Respect media: all public reads expose only `visibility=public` media (A6).

**Out of scope.** Search/matching ML, social features, contact/hire endpoints for guests (§2.6), portfolio module (S14).

**Inventory references & coverage.** §2.6 (all), §2.8 (recommended), §3 indexes, §6 (guest rules), §7. Routes: the five listed. Collections: reads `volunteer_profiles`, `volunteer_skills`, `volunteer_experiences`, `portfolio_items` (default), `opportunities`.

**Packages & env vars.** None new.

**Task checklist**
1. Talents query (enabled flag + filters; include public-safety projection).
2. Public profile resolver honouring A5 against the immutable flags; 404 semantics.
3. Public experiences + portfolio (portfolio via seam).
4. Recommendation engine (skills match weight + location + recency); paged; same skills/location source as S4.
5. Replace S6 recommended seam; remove volunteer/org public seams from S4/S5 where superseded (keep the interface so S13/S14 don't break).
6. E2E below.

**Tests to write.**
- Unit: talent filter combinations; recommendation scoring determinism; flag gating per section.
- E2E: with volunteer A (enabled, skills, experiences public) and B (disabled or partial): `/talents` returns A not B; `/volunteers/A` exposes only flagged sections; `/volunteers/A/experiences` only `publicVisibility=true` ones; `/volunteers/B` 404; guest gets 401-free reads everywhere; recommended feed differs per volunteer; foreign private data never leaks.

**Acceptance criteria & verification**
- A guest can read everything public; nothing private leaks.
- Talents/recommended behaviour deterministic.
- Verify: build/lint/test/e2e + `openspec validate public-discovery`.

**Commit message.** `feat(public-discovery): talents feed, gated profiles, recommended tasks`

---

### Session 13 — trust-layer
**Phase:** P2 · **Change:** `trust-layer` · **Depends on:** S6, S11, S9, S2

**Objective.** Add the social proof that makes the platform trustworthy: the reviews module's controllers (completing F16), the publish gate (real counter replacing the S6 default), reliability metrics recomputed by events + the job tick, and the three orphaned P2 session routes (F7).

**In scope**
- `reviews` controllers: `POST /submissions/:submissionId/review` (only after verification; one per submission — unique index → 409; rating validation), `GET /volunteers/me/reviews`, `GET /organizations/me/reviews` (reviews given; reliability uses received via verification links — see compute below).
- Publish gate: `GET /organizations/me/publish-gate` → `{ locked, pendingCount, threshold, pendingOpportunities[] }`; implement the §4 counter (distinct opportunities of the org with ≥1 submission in `submitted|under_review`; drafts never count; locked when ≥ `publishGate.maxPendingOpportunities` from `system_settings`, default 3); replace the S6 `PublishGateService` with real logic; emit `publish-gate.locked`.
- Reliability: computed from `submissions` + `verifications` timestamps (response rate, decided-vs-uploaded ratio, median time to decide) plus the anomaly flag (org's average `reviews.ratings` vs platform average); cache into `organizations.reliability` and refresh on events + the job tick (F8). Endpoint `GET /organizations/:slug/reliability` (public).
- Job: register the reliability recompute handler in the S1 `JobRegistry` (F8).
- Session routes (F7): `POST /auth/logout-all`, `GET /users/me/sessions`, `DELETE /users/me/sessions/:sessionId`.
- Extend `opportunity.started` handler to notify participants (S9 already knows the event; handler added here).

**Out of scope.** Admin hiding of reviews (S16), reports (S16), anything push/real-time.

**Inventory references & coverage.** §2.16, §2.18, §4 (gate/reliability), §2.21 (job), §7 decision 4, F7/F8/F16. Routes: the nine new. Collections: `reviews` (controllers only), reads `submissions`, `verifications`, `organizations`; writes `reliability` sub-doc, `system_settings`.

**Packages & env vars.** None new (setting `publishGate.maxPendingOpportunities` seeded by settings service).

**Task checklist**
1. Reviews controllers + validation; unique-index 409 handling.
2. Publish-gate counter query (aggregation, distinct opportunity ids) + route + service swap.
3. Reliability computation + stored sub-doc + event refresh + job handler.
4. `/organizations/:slug/reliability` public endpoint.
5. Three session routes (logout-all, sessions list, session revoke) on auth/users modules.
6. `opportunity.started` notification handler.
7. E2E below.

**Tests to write.**
- Unit: gate lock/unlock counts (drafts excluded; whole-opportunity unlock); reliability math with fixture timestamps; median handling even length.
- E2E: org with 3 opportunities each having a pending submission → gate locked → publish blocked (PUBLISH_GATE_LOCKED); decide one entire opportunity → unlocked; extra review attempt after verification → 409; ratings anomaly flag flips with synthetic reviews; `/users/me/sessions` lists + delete revokes; logout-all kills all.

**Acceptance criteria & verification**
- Gate and reliability match §4 definitions exactly.
- Sessions P2 routes work (F7 closed).
- Verify: build/lint/test/e2e + `openspec validate trust-layer`.

**Commit message.** `feat(trust): reviews, publish gate, reliability, session management`

---

### Session 14 — portfolio
**Phase:** P2 · **Change:** `portfolio` · **Depends on:** S4, S8

**Objective.** Let volunteers curate a standalone showcase beyond verified experiences: portfolio items with media, ordering, and public exposure — replacing the S12 seam with real data.

**In scope**
- `portfolio_items` model + index `(volunteerId, order)`; `media.portfolioItemId` linkage.
- Routes: `GET /portfolio/me`, `POST /portfolio/me` (title, description, mediaId(s), visibility), `PATCH /portfolio/:itemId`, `DELETE /portfolio/:itemId`, `PUT /portfolio/me/order` (reorder — atomic batch).
- Replace `PortfolioQueryService` default (S12 seam) with the real query: public list = items with `visibility=public`.
- Media validation: `MediaOwnership.assertFor(mediaId, volunteer, 'portfolio_item')`.

**Out of scope.** Verified-experience duplication (those come from S11), sharing links, featured/private toggling beyond `visibility`.

**Inventory references & coverage.** §2.15, §3 (`portfolio_items`, `media.portfolioItemId`), F9. Routes: the five listed. Collections: `portfolio_items`.

**Tests to write.**
- Unit: reorder atomicity (concurrent reorders converge), visibility filter.
- E2E: create/list/patch/delete; reorder persists; public profile route now returns real items (regression: S12 seam removed); private items hidden from guests; foreign item ops 404.

**Acceptance criteria & verification**
- `GET /volunteers/:username/portfolio` returns seeded real items.
- Verify: build/lint/test/e2e + `openspec validate portfolio`.

**Commit message.** `feat(portfolio): curated showcase with ordering and visibility`

---

### Session 15 — admin-and-moderation (Part A: users & organizations)
**Phase:** P3 · **Change:** `admin-and-moderation` (shared change, Part A) · **Depends on:** S2, S5, S7

**Objective.** The moderation backbone for accounts: admin stats overview, users/volunteers/organizations listing, user/organization status control, and the organization-verification approve/reject decision (which F1's core loop depends on).

**In scope**
- Admin guards (`@Roles('admin')` + audit interceptor).
- `GET /admin/stats/overview` (counts, hours, verification rate, gate freezes from §4/§2.20).
- `GET /admin/users?role=&status=&q=`, `GET /admin/users/:userId`, `PATCH /admin/users/:userId/status` (active/suspended — suspended users rejected by S1 guard).
- `GET /admin/volunteers`, `GET /admin/organizations`, `GET /admin/organizations/verifications?status=pending`.
- `POST /admin/organizations/:organizationId/verification/approve` (sets `verifiedAt/verifiedBy`, `verificationStatus=verified`; emits `org.verification.updated`), `POST /admin/organizations/:organizationId/verification/reject` (`{ rejectionReason }` → `rejected`).
- `PATCH /admin/organizations/:organizationId/status` (active/suspended; suspended orgs cannot publish — already enforced in S6).

**Out of scope.** Opportunities/reviews/reports/audit/settings admin (Part B), skill/location admin (already in S3).

**Inventory references & coverage.** §2.20 (first half), §3 (`audit_logs`), §6 (suspended rules), F1. Routes: the thirteen listed. Transitions: `users.status`, `organizations.status`, `organizations.verificationStatus` via admin.

**Tests to write.**
- Unit: audit interceptor records admin actions; approve sets the right fields/events.
- E2E: non-admin 403 everywhere; admin lists/filters; suspend volunteer → their auth calls 403; suspend org → publish 403 (regression with S6); approve makes org publishable (this unblocks F1 end-to-end); reject sets reason + org can resubmit (S5) back to pending.

**Acceptance criteria & verification**
- Only the seeded admin can act here; all admin actions are in `audit_logs`.
- Verify: build/lint/test/e2e + `openspec validate admin-and-moderation` (status shared with Part B).

**Commit message.** `feat(admin): users, organizations, and verification decisions (part A)`

---

### Session 16 — admin-and-moderation (Part B: opportunities, reports, audit, settings)
**Phase:** P3 · **Change:** `admin-and-moderation` (shared change, Part B) · **Depends on:** S13, S15

**Objective.** The rest of the moderation surface: opportunity control, review hiding, reports (user-submitted + admin resolution), audit-log browsing, and system settings including the publish-gate threshold. Also closes the `reports` change (P3).

**In scope**
- `GET /admin/opportunities`, `PATCH /admin/opportunities/:opportunityId/status` (force close/cancel).
- `PATCH /admin/reviews/:reviewId/hide` (`status=hidden` — hidden reviews excluded from reliability + anomalies).
- `POST /reports` (Auth; `targetType, targetId, reason, description`), `GET /admin/reports`, `PATCH /admin/reports/:reportId` (`{ status, resolution }`).
- `GET /admin/audit-logs?actor=&entity=&date=`.
- `GET /admin/settings`, `PUT /admin/settings/:key` (`publishGate.maxPendingOpportunities` etc.).
- Catch-up: the `reports` module (module 21, P3) is created here.

**Out of scope.** Anything in Sessions 1–15.

**Inventory references & coverage.** §2.19, §2.20 (second half), §3 (`reports`, `audit_logs`, `system_settings`), F8 (gate setting). Routes: the ten listed. Transitions: reports `open → in_review → resolved|dismissed` (defined here); reviews `visible → hidden`.

**Tests to write.**
- Unit: report status flow; settings upsert + cache invalidation.
- E2E: volunteer reports; admin resolves; hidden review disappears from public/anomaly queries; audit filter; force-close an `in_progress` opportunity; settings changed then publish gate reflects the new threshold (regression with S13).

**Acceptance criteria & verification**
- All §2.20 routes present; every write audited.
- Verify: build/lint/test/e2e + `openspec validate admin-and-moderation`; then `openspec archive admin-and-moderation -y` (change created in Part A; extend only — see runner note).

**Commit message.** `feat(admin): opportunities, reports, audit-logs, settings (part B)`

---

### Session 17 — seed data & admin bootstrap
**Phase:** Final · **Change:** `seed-data` · **Depends on:** all sessions 1–16

**Objective.** Produce the complete prod/dev seed payloads and the admin account script (F14 resolved here): 58 wilayas + municipalities, the skill catalog (A4 list, flagged for confirmation against the project document), and `seed:admin` from env.

**In scope**
- `src/seed-data/locations.ts` (from S3) extended to the canonical full dataset if S3 used a reduced file — single source of truth.
- `src/seed-data/skills.ts` complete per A4.
- `src/scripts/seed-admin.ts`: upsert `users` with role `admin` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotent; never resets a password of an existing admin unless `SEED_ADMIN_RESET=true`).
- `src/scripts/seed-demo.ts`: ONE verified demo organization (creates user + org, sets `verificationStatus=verified` via the same service path as admin approval, avoiding orphan field edits) + one demo volunteer with skills — for manual QA and the E2E warm-up.
- npm scripts: `seed:locations`, `seed:skills`, `seed:admin`, `seed:demo`, `seed:all` (runs the four idempotently).
- `openspec/config.yaml` note that `seed-data` is data-only (uses `--skip-specs`? **No**: seed gives requirements — normal archive).

**Out of scope.** E2E (S18), deploy (S20), docs (S21).

**Inventory references & coverage.** §2.3/§2.4 (seeds), §2.1 (admin seed per §7), task instruction "58 wilayas, skill categories, admin seed", F10/F14. Collections touched: `users`, `organizations`, `locations`, `skill_categories`, `skills`.

**Tests to write.**
- Unit: seed idempotency (run scripts twice → same record counts, no dupes); admin upsert preserves existing password unless reset flag.
- E2E (smoke): running `seed:all` against a fresh memory DB yields 58 wilayas, N municipalities, M categories, 1 admin, 1 demo org (verified), 1 demo volunteer.

**Acceptance criteria & verification**
- `npm run seed:all` twice in a row is stable.
- Admin can log in; demo org can publish (regression with F1 closure).
- Verify: build/lint/test/e2e + `openspec validate seed-data`.

**Commit message.** `feat(seed): full location/skill payloads and admin bootstrap`

---

### Session 18 — end-to-end core-loop test
**Phase:** Final · **Change:** none (test-only; no OpenSpec change) · **Depends on:** S11, S16, S17

**Objective.** One test that runs the entire product loop the way a user would, against an in-memory replica set, proving Definition of Done 1: register → profile+skills → org posts → apply → accept → (job) start → submit evidence → verify → experience public + `/verify/:code`.

**In scope**
- `test/e2e/core-loop.e2e-spec.ts` orchestrating:
  1. volunteer registers + verifies email (log mail + direct token consumption helper for tests) + builds profile/skills/availability + `publicProfile.enabled=true`;
  2. org registers, submits verification docs, seeded admin approves via admin route;
  3. org publishes opportunity (`startDate` in the past, `applicationDeadline` in the future, positions with `requiredCount`);
  4. volunteer applies → informs jobs: call `POST /api/v1/internal/jobs/run` with `X-Jobs-Key` (exercises the endpoint) → opportunity `in_progress`, participant `active` (proves the F15 schedule dependency is testable);
  5. volunteer submits evidence (image via `STORAGE_PROVIDER=local`/double) with consent;
  6. org `start-review` → verify with `review` → everything asserted (F4/F12/F16 paths);
  7. `GET /verify/:code` returns the public summary; `GET /volunteers/:username` shows the experience; stats on dashboard incremented;
  8. negative probes: applying before verification of email fails; non-verified org publish 403; gate still closed for a second org with pending submissions (S13 regression).
- A `test/helpers/seed-utils.ts` reusing S17 seeds.

**Out of scope.** Deployment (S20), performance (S19), docs (S21), anything not the core loop.

**Inventory references & coverage.** §5 (all three transactions exercised), §2.21 (jobs), §2.6 (public outcome), F1/F15. Routes exercised: the full list in the flow above.

**Tests to write.** The e2e spec itself; plus a rollback assertion inside step 6 (inject a failing dependency once → assert nothing persisted).

**Acceptance criteria & verification**
- The core loop passes end to end with no external services (all fakes/local).
- Verify: `npm run test:e2e -- --testPathPattern=core-loop`. No OpenSpec artifacts (test-only session — the runner skips change creation; commit the spec as-is).

**Commit message.** `test(e2e): full core loop through verify and public proof (no change)`

---

### Session 19 — security & performance pass
**Phase:** Final · **Change:** `security-performance` · **Depends on:** S13, S18

**Objective.** Hardening and scale-readiness within the free-tier envelope (inventory §10): tighten throttling, harden media/SSRF and file handling, verify all indexes with real query plans, audit the transaction paths, and prove the sleeping-host story (idempotent jobs, no local state).

**In scope**
- Throttler: stricter on `login`, `forgot-password`, `resend-verification`, `upload`; global defaults.
- Helmet + CSP tuning (Swagger only in non-prod); `process.env` secrets never logged (grep audit); constant-time jobs-key compare (already in S1 — verify).
- SSRF/allowlist: `/media/links` host allowlist re-verified; presigned URL `expiresIn` ≤ 15 min; upload size/mime re-read at confirm (F17 regression).
- ObjectId/CastError coverage; DTO whitelist audit; error-code consistency (`UPPER_SNAKE`).
- Index review: run `explain()` on: feed, talents, recommended, gate counting, reliability queries, notifications unread; add/confirm the §3 compound indexes incl. `(status, categoryId)`, `(publicProfile.enabled, location.municipalityId)` for talents, gate aggregation indexes; document the decision between the single text index and 2dsphere on opportunities (F11) — canonical choice: geo filter via indexed `location` fields for `wilayaId/municipalityId` and keyword via `$regex` with an early `categoryId` bound, reserving the text index until volume justifies it; record it in `design.md`.
- N+1 scan: verify list endpoints batch-populate (skills, media, orgs).
- Auth: refresh-rotation edge cases (reuse detection → revoke all sessions of the user), token expiry, TTL cleanup soak.
- Audit: sensitive actions list complete (§0).
- A load smoke (optional, small seeding loop) to sanity-check pagination depth at 50.
- Note in README: Atlas network rule 0.0.0.0/0 is MVP-only.

**Out of scope.** Vertical scaling, CDN, OAuth providers, anything paid.

**Tests to write.**
- Unit: refresh-token-reuse detection; throttler overlimits; link allowlist bypass attempts.
- E2E: upload size/mime abuse rejected at confirm; hidden review stays hidden; report spam rate-limited.
- `explain()` assertions (assert `winningPlan` uses the intended index) for the five hot queries.

**Acceptance criteria & verification**
- No new vulnerabilities in a `npm audit` beyond table-stakes; every hot query uses an index; all S1–S18 tests still green.
- Verify: build/lint/test/e2e + `openspec validate security-performance`.

**Commit message.** `perf(security): index audit, throttling, hardening pass`

---

### Session 20 — deployment (Render + Atlas)
**Phase:** Final · **Change:** `deployment` · **Depends on:** S18, S19

**Objective.** The backend runs on Render Free pointed at Atlas M0, woken and driven by the free scheduler, with zero external dependencies beyond the humans' §3 accounts.

**In scope**
- `render.yaml` (or Render dashboard instructions — provide both): Web Service, Node ~20, `buildCommand: npm ci && npm run build`, `startCommand: npm run start:prod`, Free instance, `envVars` mapping all `.env` names incl. `NODE_ENV=production`, `PORT` auto-injected; **disk**: none used by the app (seeds run via `EPHEMERAL DISK: npm run seed:admin` and seed script one-shot).
- Atlas: connection string in `.env` (A3); confirm network allowlist 0.0.0.0/0 and db name in URI.
- Scheduler: document cron-job.org setup + ship `.github/workflows/keep-alive.yml` (A8) calling `/api/v1/internal/jobs/run` every 15 min with `JOBS_KEY` from repo secrets — works even with no card.
- Health check wiring: Render pings `GET /api/v1/health`; external keep-alive also warms the host.
- Verify the free-tier envelope: no queue/Redis anywhere; no local disk writes at runtime; `MAIL_*`/`STORAGE_*` from §3; `PUBLIC_BASE_URL` is the Render URL (used by `/verify/:code` links and emails).
- A short `docs/DEPLOY.md` capturing the exact click-path + env list.

**Out of scope.** CI/CD pipelines (out of scope run), frontend deployment, vertical upgrades.

**Deployment note.** Local verification: `npm run build` + a `NODE_ENV=production` smoke boot reading a real (or env-file) `MONGO_URI`. Render deploy is manual by the human at this point; the roadmap cannot click the dashboard — the agent only checks in the service config and doc (definition of done item 7).

**Tests to write.** A `test:e2e` prod-mode boot against the memory DB asserting the app starts with `production` config and that `/api/v1/health` responds without secrets in logs.

**Acceptance criteria & verification**
- `render.yaml` + `.env.example` align (every var the app reads exists in one of the two lists).
- `npm ci && npm run build && npm run start:prod` boots (verified locally / via Render after the human connects the service).
- No runtime free-tier violation (no queues/Redis/disk writes).
- Verify: build/lint/test/e2e + `openspec validate deployment`.

**Commit message.** `chore(deploy): Render + Atlas config, scheduler notes, keep-alive workflow`

---

### Session 21 — final documentation
**Phase:** Final · **Change:** none (docs-only) · **Depends on:** S20

**Objective.** Make the backend self-describing: complete README, full Swagger/OpenAPI, and a final validation sweep of the OpenSpec state and the inventory's deferred list.

**In scope**
- `/backend/README.md` rewrite: quickstart, env table, scripts, testing with the memory DB, deploy link, deferred features (§9).
- Swagger: add missed endpoint/DTO decorators from S3–S16 so the API surface is 100% documented; tag groups per module; enable on the staging/Demo via `SWAGGER_ENABLED`.
- `docs/DEPLOY.md` polish merged into README; keep single doc.
- `openspec doctor` + `openspec validate --all --strict` final pass; fix any remaining spec warnings (e.g. "Purpose: TBD" headers introduced by archive — replace with the real capability purpose).
- A one-page `docs/API.md` summarizing route counts vs inventory §2 (the ~122-route reconciliation).

**Out of scope.** Any code behaviour change (unless a doc-only edit); frontend docs.

**Acceptance criteria & verification**
- Swagger loads and lists every route from §2 with schemas.
- `openspec validate --all --strict` clean; `openspec doctor` healthy.
- Route count reconciles with the inventory.
- Verify: `npm run build && npm run lint && npm test && npm run test:e2e` (unchanged green) + `openspec validate --all --strict`.

**Commit message.** `docs: final README, OpenAPI completeness, spec sweep`

---

## 5. Session runner (paste this per session)

Generic prompt that works for any session in §4. Replace the `<…>` placeholders from the session table below.

```
Run Session <N> of docs/ROADMAP.md: "<NAME>".

Change: <CHANGE_NAME>. Phase: <P1|P2|P3|Final>. Workspace: repo root C:\Users\Failasouf\Desktop\projects\basmatck; backend code lives in /backend. Never push. Never touch other sessions or backend-inventory.md.

PHASE 1 — AUTHOR THE OPENSPEC CHANGE (then stop for my review):
1. Read docs/ROADMAP.md §4 "Session <N>" and the inventory sections it cites (backend-inventory.md at the repo root).
2. Check `openspec list`. If <CHANGE_NAME> is NOT listed and this session is Part A of a split change, run:
     openspec new change <CHANGE_NAME> --description "<scope line>"
   If it IS listed (split Part B sessions 11/16), skip creation and REUSE the existing change. Test-only sessions (18) and docs-only sessions (21) and bootstrap (0) create no change.
3. For each artifact in order (proposal, specs, design, tasks), first run `openspec instructions <artifact> --change <CHANGE_NAME>` and follow the enriched guidance, then write:
     openspec/changes/<CHANGE_NAME>/proposal.md
     openspec/changes/<CHANGE_NAME>/specs/<capability>/spec.md   (one per New/Modified capability in the proposal)
     openspec/changes/<CHANGE_NAME>/design.md
     openspec/changes/<CHANGE_NAME>/tasks.md
4. Validate completeness:
     openspec validate <CHANGE_NAME>
     openspec status --change <CHANGE_NAME>
5. STOP. Reply with a short summary (capabilities, tasks count, any deviations) WITHOUT implementing. Wait for my go.

PHASE 2 — IMPLEMENT (only after I say go):
6. Work through tasks.md in /backend; check off each `- [ ] X.Y ...` as you complete it. Do not invent routes/fields beyond the session scope. If the session says change > too-big, it was already split — keep this session inside its half.
7. Run the session's verification from /backend (workdir.../backend):
     npm run build
     npm run lint
     npm test
     npm run test:e2e
   Fix every failure until all are green, then from the repo root run:
     openspec validate <CHANGE_NAME>
     (final sessions: also `openspec validate --all --strict`; session 21 also `openspec doctor`.)
8. Archive the change (skip for change-less sessions 0/18/21):
     openspec archive <CHANGE_NAME> -y
9. Commit locally with the session's suggested message:
     git add -A
     git commit -m "<suggested commit message>"
   Never push, never amend, never create branches unless asked.
10. Report: what was built (routes/collections/transitions), tests run, verification results, archive status, dev, if any, from the session scope.
```

Mapping of `<N>`/`<CHANGE_NAME>`: 1 → `foundation`, 2 → `auth-and-users`, 3 → `reference-data`, 4 → `volunteer-profiles`, 5 → `organizations`, 6 → `opportunities`, 7 → `applications-and-participation`, 8 → `media`, 9 → `notifications`, 10 → `submissions-verification-experiences` (Part A), 11 → `submissions-verification-experiences` (Part B, reuse), 12 → `public-discovery`, 13 → `trust-layer`, 14 → `portfolio`, 15 → `admin-and-moderation` (Part A), 16 → `admin-and-moderation` (Part B, reuse), 17 → `seed-data`, 18 → (none), 19 → `security-performance`, 20 → `deployment`, 21 → (none).

Exact OpenSpec surface (verified on this machine, v1.5.0): `openspec new change` (creates `openspec/changes/<name>/` with `.openspec.yaml` + `README.md`), `openspec instructions <artifact> --change <name>`, `openspec validate <name>` / `--all --strict`, `openspec status --change <name>`, `openspec list` / `openspec show <name>`, `openspec archive <name> -y` (moves to `openspec/changes/archive/<date>-<name>` and applies deltas to `openspec/specs/`), `openspec doctor`, `openspec context`. The legacy `openspec change ...` / `openspec spec ...` commands are deprecated in 1.5.0 — use the verb-first forms above.

---

## 6. Definition of done (whole backend)

1. **Core loop works end to end** (proven by Session 18's e2e): volunteer registers + verifies email → builds profile, skills, availability (public profile on) → organization registers, becomes `verified` (admin-approved path and/or seeded demo org), posts an opportunity → volunteer applies → organization accepts (transaction) → volunteer becomes `active` (job tick, `startDate`-driven) → submits evidence with consent → organization verifies (transaction) → the verified experience appears on the volunteer's public profile and at `GET /verify/:code` with only public media.
2. **All P1 routes exist and behave per §2** (Sessions 1–12 land every P1 line in the inventory table: ≈82 routes), all three transactions (accept, verify, accepted-withdraw) are transaction-tested on the replica-set-capable in-memory rig.
3. **P2/P3 are present** (Sessions 13–16): trust (reviews, publish gate lock/unlock with the §4 definition, reliability), portfolio, admin-and-moderation with audit logging.
4. **Everything is free-tier** (§10): no Redis, no queues, no push provider, no paid SMS, no paid services anywhere in code, config, or docs; rate limiting in-memory, notifications in MongoDB, jobs via the free external scheduler against `POST /internal/jobs/run`.
5. **Tests pass**: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` are green from `/backend` at every session boundary.
6. **OpenSpec state is clean**: every session change is archived, `openspec validate --all --strict` passes, `openspec doctor` is healthy; `openspec/specs/` reflects all capabilities.
7. **Deployment config is present**: `render.yaml`/dashboard doc, `.env.example`, Atlas URI guidance, scheduler + keep-alive workflow, and `docs`/README covering them (Sessions 20–21).
8. **Git history**: one local commit per session, never pushed, with the suggested messages.
```