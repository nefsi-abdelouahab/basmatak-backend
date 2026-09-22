## 1. Schemas and status machine

- [x]1.1 Add the `Opportunity` schema via `createSchema` in `src/opportunities/schemas/opportunity.schema.ts`: `organizationId`, unique `slug`, `title`, `description`, `categoryId`, `status` (`draft|published|in_progress|completed|closed|cancelled`, default `draft`), `startDate?`, `applicationDeadline?`, `location { wilayaId, municipalityId, coordinates }`, and an embedded `PositionSchema` (`title`, `description`, `requiredCount` ≥ 1, `filledCount` default 0, `requiredSkills` as `[ObjectId]`). Indexes (inventory §3): unique `slug`, `(status, startDate)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description`, and `positions.requiredSkills.skillId`
- [x]1.2 Register the `opportunity` entity whitelist in `StatusTransitionRegistry` at `OpportunitiesModule.onModuleInit` with the D5 pairs — `draft→published`, `published→in_progress`, `in_progress→completed`, `published→closed`, `published→cancelled`, `in_progress→closed`, `in_progress→cancelled`, plus the job path `accepted→active`
- [x]1.3 Call `SettingsService.ensureDefaults()` from `OpportunitiesModule.onModuleInit` so `publishGate.maxPendingOpportunities=3` is seeded at boot (S1 built the method; nothing invoked it yet)

## 2. Pre-S7 adapter and job handler

- [x]2.1 Create `src/opportunities/task-participants.adapter.ts` wrapping the raw driver (`this.connection.db.collection(...)`): `activateAcceptedForOpportunity(opportunityId)` via `updateMany({ opportunityId, status: 'accepted' }, { $set: { status: 'active' } })`, `countAccepted(opportunityId)` (`status` in `['accepted','active']`), and `countByPosition(positionId)`; field names per inventory §3; comment marks it S6-only and that Session 7 replaces it with the owning Mongoose models (D7)
- [x]2.2 Implement and register the `opportunityStartTicker` handler in `JobRegistry` (`register('opportunityStartTicker', ...)`): find `{ status: 'published', startDate: { $lte: now } }`, for each assert `published→in_progress` via `StatusTransitionService` (actor = fixed zero sentinel `new Types.ObjectId('000000000000000000000000')`), `$set` status `in_progress`, run `adapter.activateAcceptedForOpportunity(id)`, then emit `DomainEvents.OpportunityStarted`; idempotent on double-run (D8)

## 3. OpportunitiesService

- [x]3.1 `createOpportunity(account, dto)`: resolve owning org by `organizations.userId` (`OrganizationsService.findByUserId`, else 404), validate `requiredSkills` against active skills (`SkillsService`), create `status=draft` with `slug` via `createWithUniqueSlug` from the title (A12 retry)
- [x]3.2 Feed `listPublic(query)`: indexed facet filter (`status:'published'`, optional `wilayaId`, `municipalityId`, `categoryId`, `startDate` `$gte`/`$lte` from `from`/`to`, `skillId` via `positions.requiredSkills`, `hasOpenPositions=true` via `positions: { $elemMatch: { $expr: { $lt: ['$filledCount','$requiredCount'] } } }`, `q` via escaped case-insensitive `$or` on title/description with an early `categoryId` bound) — no `$text` (F11, D2); `sort({ _id:-1 })` with `_id < cursor` pagination via `normalizeLimit` (default 20, max 50)
- [x]3.3 Detail `getByIdOrSlug(idOrSlug)`: ObjectId lookup when 24-hex valid, else `slug` lookup; return only when `status==='published'`, otherwise 404 (F5, D3)
- [x]3.4 `listOwn(account, query)`: all statuses of the owning org, cursor-paginated, newest first
- [x]3.5 `updateOpportunity(account, id, dto)`: owning-org-only (else 404); pre-publish editable set (title, description, categoryId, startDate, applicationDeadline, location); post-publish only description + forward-only applicationDeadline and only while `adapter.countAccepted(id) === 0` (D9); `slug`/`organizationId`/`status`/`positions` not settable (DTO forbids)
- [x]3.6 `deleteOpportunity(account, id)`: owning org, hard-delete only when `status==='draft'`, else 409 `OPPORTUNITY_NOT_DRAFT`
- [x]3.7 `publish`/`close`/`cancel`/`complete`: resolve owning org; publish requires `verificationStatus==='verified' && status==='active'` else 403 `ORG_NOT_VERIFIED`, then `await publishGate.evaluate({ id: org._id })` and locked → 409 `PUBLISH_GATE_LOCKED`; every action asserts the §5 pair via `StatusTransitionService` then `$set` the new status; `cancel` emits `DomainEvents.OpportunityCancelled`; `close`/`cancel` from `published|in_progress`, `complete` from `in_progress`
- [x]3.8 Positions CRUD (`addPosition`, `updatePosition`, `deletePosition`): owning org; create on drafts freely and on `published` only while `adapter.countAccepted(id)===0`; patch rejects `requiredCount < filledCount` (409 `POSITION_REQUIRED_COUNT_LOWER_THAN_FILLED`); delete rejects while `filledCount > 0` or `adapter.countByPosition(positionId) > 0` (§2.8 "only if no applications")

## 4. Controllers, routes, module and env wiring

- [x]4.1 `OpportunitiesController`: `GET /opportunities` (`@Public()` feed), `GET /opportunities/recommended` (`@Roles('volunteer')`, returns `[]` — S6 seam) declared BEFORE `GET /opportunities/:idOrSlug` (`@Public()`) so the catch-all does not shadow it (D3)
- [x]4.2 Own-org routes on the same controller with the static path `POST/GET /organizations/me/opportunities` (`@Roles('organization')`); `OpportunitiesModule` imported BEFORE `OrganizationsModule` in `AppModule` so `me/opportunities` registers ahead of S5's `GET :slug/opportunities` (D4; additive import only)
- [x]4.3 `PATCH/DELETE /opportunities/:opportunityId` and `POST /opportunities/:opportunityId/{publish,close,cancel,complete}` (`@Roles('organization')`, own-resource only)
- [x]4.4 `PositionsController` under `/opportunities/:opportunityId/positions` with `POST`, `PATCH .../positions/:positionId`, `DELETE .../positions/:positionId` (`@Roles('organization')`)
- [x]4.5 Wire `OpportunitiesModule` (imports `OrganizationsModule` + `SkillsModule`, `MongooseModule.forFeature` for the opportunities schema; provides service, adapter, controllers) into `backend/src/app.module.ts` additively before `OrganizationsModule`; leave `src/volunteers/**` and `src/organizations/**` untouched
- [x]4.6 Confirm `.env.example` already declares `PUBLISH_GATE_ENABLED` (S0 line, default-false comment) — do not duplicate it; boot-time default seeding is covered by 1.3

## 5. Tests

- [x]5.1 Unit: `opportunity` transition whitelist — authorized pairs accepted (incl. `accepted→active` job path), unauthorized pairs throw `INVALID_STATUS_TRANSITION`
- [x]5.2 Unit: position seat rules — patch to `requiredCount < filledCount` rejected; delete with `filledCount > 0` rejected
- [x]5.3 Unit: `opportunityStartTicker` idempotency — double run transitions once and activates each seeded participant exactly once
- [x]5.4 E2E: verified org creates a draft with positions → publishes → appears in the public feed and detail; `hasOpenPositions` filter behaves
- [x]5.5 E2E: `close` and `cancel` from `published` and `in_progress`; closed/cancelled opportunities leave the feed; `complete` from `in_progress` only
- [x]5.6 E2E: pending (non-verified) org publish → 403 `ORG_NOT_VERIFIED`; a verified org publishes fine
- [x]5.7 E2E: `PUBLISH_GATE_ENABLED=true` + gate locked → 409 `PUBLISH_GATE_LOCKED`; default (flag off) publishes
- [x]5.8 E2E: opportunity with `startDate` in the past → `POST /api/v1/internal/jobs/run` with `X-Jobs-Key` → opportunity `in_progress` and seeded `accepted` participants become `active`; a second run is a no-op; participants seeded directly via the adapter/driver
- [x]5.9 E2E: `filledCount` never drops below `requiredCount`; `limit` clamps at 50 and pages advance by cursor
- [x]5.10 E2E: `GET /opportunities/recommended` returns `[]` for a volunteer; `GET/POST /organizations/me/opportunities` hits the opportunities handler not `:slug/opportunities` (D4); detail returns 404 for non-published; draft-only delete (409 otherwise); post-publish PATCH limited and blocked once an accepted participant exists
- [x]5.11 E2E: `GET /organizations/:slug/opportunities` (S5 route) now returns real published opportunities instead of `[]`

## 6. Verification and commit

- [x]6.1 From `/backend` run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` and fix every failure until all green (leave parallel sessions' failing suites untouched if they are unrelated in-flight work)
- [x]6.2 From the repo root run `openspec validate opportunities` and `openspec status --change opportunities` (all artifacts done)
- [x]6.3 Archive: `openspec archive opportunities -y`
- [x]6.4 Commit locally, staging ONLY this session's files (`git add backend/src/opportunities`, the `backend/src/app.module.ts` diff, `openspec/specs/opportunities`, `openspec/specs/extension-seams/spec.md`, `openspec/changes/archive/<date>-opportunities`) with message `feat(opportunities): task lifecycle, positions, feed and startDate job tick`; never push, never amend, never create branches; leave parallel sessions' files and other OpenSpec changes unstaged