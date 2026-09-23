## Context

Part A of the shared `admin-and-moderation` change (Session 15; Part B extends the same change in Session 16). The trust loop is blocked today by F1: an organization can submit verification documents (Session 5) but only the P3 admin route can move it `pending → verified`, and no admin surface exists. The S1 `RolesGuard`/`@Roles('admin')`, the S1 `SuspendedGuard` (rejects `users.status=suspended`), the S1 `AuditInterceptor` (already writes `audit_logs` for every admin action and every PATCH/DELETE on org/volunteer resources), and the S1 `StatusTransitionService` (registered whitelists per entity) are all already built and governed by `common-core`, `audit-logging`, and `status-transitions` specs. The `organization` entity whitelist is already registered by `OrganizationsModule` with `pending → verified | rejected → pending`; there is no `user` whitelist yet because no route has ever mutated `users.status` (the admin user-status change is the first and only mutation path).

Existing admin tooling to build on: `AdminLocationsController`/`AdminSkillsController` prove the `@Roles('admin')` + `@Controller('admin/...')` pattern, and the S3 admin routes operate on reference data. `OrganizationsService` owns org reads (`findByUserId`, `getPublicOrganization`) and the verification-document flow; `organization_verifications` rows already carry `decidedAt`/`decidedBy` (used today only by S5's reject scenario, unfilled until now). `volunteer_profiles.stats.volunteerHours` accumulates via Session 11's verify transaction. The publish-gate count rule comes from §4/§2.20: an organization is locked when the number of its distinct opportunities having ≥1 submission in `submitted|under_review` reaches `publishGate.maxPendingOpportunities` (read from `system_settings`, default 3). The S9 `NotificationsEventHandlers` already forward-registers `org.verification.updated` (`notifyOrgFromPayload` resolves the org account from `payload.organizationId`), so approve/reject only needs to emit the event.

Constraints carried in: NestJS 10 + TS strict, `/api/v1` prefix, `{ statusCode, code, message, details? }` UPPER_SNAKE error envelope, DTO whitelist + forbidNonWhitelisted + transform, cursor pagination (default 20 / max 50) via `common/pagination/*`, and the admin seeding constraint: no `seed:admin` script this session (F14/S17) — tests build an admin-capable user through `UsersService.create` (role `admin`) directly.

## Goals / Non-Goals

**Goals:**
- A `backend/src/admin/` module owning the Part A surface: stats overview, user/volunteer/organization listing, user + organization status control, and the organization-verification approve/reject decision.
- All 13 Part A routes from §2.20 (first half): every write audited by the S1 interceptor, every list paginated, every status change routed through `StatusTransitionService.assert`.
- `org.verification.updated` emitted on approve/reject so the org account is notified (S9 handler already registered); approval is the F1 unblock — a verified org can publish.
- E2E proof that suspend-user blocks their auth calls (S1 regression), suspend-org blocks publishing (S6 regression), and approve→publish closes F1 end-to-end.

**Non-Goals:**
- Part B (Session 16): opportunities admin, review hiding, reports, audit-log browsing, settings admin.
- `seed:admin` (Session 17). Skill/location admin already exists (S3). No changes to `users`/`organizations`/`organization_verifications`/`opportunities`/`submissions` collections themselves (no new fields, no new indexes, no schema edits — only reads of existing fields except the `decidedBy`/`decidedAt`/`rejectionReason` fields already defined on `organization_verifications`).
- No new packages, env vars, or Mongo transactions.

## Decisions

**D1 — Module layout mirrors the reference-data precedent, not a giant singleton.** New `backend/src/admin/` with one controller per resource and one service over it:
- `admin.module.ts` — imports `AuthModule` (JWT guard), `UsersModule`, `OrganizationsModule` (for the exported Mongoose models + services), `OpportunitiesModule`/`SubmissionsModule` read access where needed (stats), and re-registers the foreign Mongoose models the admin queries read (the notifications module precedent: `MongooseModule.forFeature` in the admin module for `users`, `organizations`, `organization_verifications`, `volunteer_profiles`, `opportunities`, `submissions`, `system_settings`). Implements `OnModuleInit` to register the `user` whitelist and extend the `organization` whitelist with `active ↔ suspended`.
- `stats.controller.ts` + `stats.service.ts`, `users.controller.ts` (admin users) + `users.service.ts`, `volunteers.controller.ts`, `organizations.controller.ts` (admin orgs) + `organizations.service.ts`. Each controller is `@Controller('admin/...')` + `@Roles('admin')` exactly like S3's admin controllers.

Rationale: keeps each Part A concern small and testable, matches the S3 admin-controller shape, and leaves Part B (Session 16) free to add `opportunities`/`reports`/`audit-logs`/`settings` controllers to the same module.

**D2 — Stats overview is one aggregation pass over the already-indexed fields, with the gate-freeze count intentional-structure.** `GET /admin/stats/overview`:
- `counts`: `users` = `countDocuments({})`; `volunteers` = `countDocuments({ role: 'volunteer' })`; `organizations` = `countDocuments({})`; `verifiedOrganizations` = `countDocuments({ verificationStatus: 'verified' })`; `opportunities` = `countDocuments({})` on opportunities; `pendingVerifications` = `countDocuments({ status: 'pending' })` on `organization_verifications`.
- `totalVolunteerHours` = aggregate `$group` on `volunteer_profiles` summing `stats.volunteerHours`.
- `verificationRate` = `verifiedOrganizations / organizations` computed as a float (0 when `organizations === 0`).
- `gateFreezes` = count of distinct `organizations` ids that are currently locked per §4: an aggregation over `submissions` with status `in: ['submitted','under_review']`, grouped by `organizationId` and by distinct `opportunityId` (the gate counts **opportunities**, so a pre-group dedupes opportunity ids before counting), then compared against the `publishGate.maxPendingOpportunities` threshold read from `system_settings` (default 3) via `SettingsService`. This is a read-only approximation of the S13 gate math with no stored state; the exact decision line (pendingCount ≥ threshold) is shared with the gate's rule so the number is meaningful even before Session 13 owns the stored logic.

Alternative considered — computing one giant `$facet` aggregation. Rejected: it would couple the stats shape to Mongo's facet syntax and make per-metric unit tests harder; parallel `countDocuments` calls over small collections are fine at MVP scale (free tier, no complex compound scans needed).

**D3 — Admin list endpoints are read-only projections with NO extra indexes; the `404` path follows `requireOwned*`.** `GET /admin/users?role=&status=&q=` builds `{ ...({role} if set), ...({status} if set), ...(q ? { email: { $regex: escape, $options: 'i' } } : {}) }`, selects `-passwordHash`, and cursor-paginates by `_id` descending (newest-first), limit normalized 20/50. `GET /admin/volunteers` aggregates per-page: query `volunteer_profiles` paginated, then `$in`-fetch the linked `users` (by `profile.userId`) and merge — avoids N+1 (the S19 N+1 scan mandate) without pagination-depth leaks. `GET /admin/organizations` paginates every org ordered newest-first. `GET /admin/organizations/verifications?status=pending` reads `organization_verifications` (default `status=pending`, oldest-first by `submittedAt` for FIFO triage), then enriches each row with its org summary (`organizations` by `_id` `$in`) — this is the moderator decision queue.
- `GET /admin/users/:userId` uses `users.findById`; id not found (or invalid ObjectId mapped by the global CastError → 400 filter, `INVALID_ID`) → `404 USER_NOT_FOUND`.
DTOs are `query` DTOs with `@IsIn` on `role`/`status`, `@IsOptional() @IsString()` on `q`, and `@IsOptional() @Type(() => Number)` on `limit`/`cursor` — validate with whitelist + forbidNonWhitelisted. Regex `q` is escaped so `$regex` is never user-controlled regex injection.

**D4 — Whitelist registration is additive: register `user`, extend `organization`.** In `AdminModule.onModuleInit`:
- `registry.register('user', [['active','suspended'], ['suspended','active']])`;
- the `organization` registration is **extended** by appending `[['active','suspended'], ['suspended','active']]` to the existing `registry.register('organization', ...)` call inside `OrganizationsModule.onModuleInit` (Part A edits that call site). `organizations.module.ts` currently registers `['pending','verified'],['pending','rejected'],['rejected','pending']`; the admin status pairs belong on the same entity type because `status_histories` tracks `organizations.status` changes as `entityType: 'organization'`. No other entity whitelists are touched. (The spec's "extension" requirement is satisfied by editing the one registration array — the delta is additive in behavior, not a second registration.)

**D5 — User status control is service-level with a guard-proof loop.** `PATCH /admin/users/:userId/status { status }` (DTO `@IsIn(['active','suspended'])`): load user (404 if absent); if `user.status === 'deleted'` → 409 `INVALID_STATUS_TRANSITION` (whitelist cannot express `deleted → *`); if `user.status === requested` → 409 (no-op). Else `StatusTransitionService.assert({ entityType:'user', entityId, from: user.status, to: requested, actor })`, then `updateOne({ $set: { status: requested } })`. The S1 `SuspendedGuard` is applied **after** JWT identity but the guard reads `users.status` from a fresh DB load per request (confirmed in SuspendedGuard) — so a newly suspended account's *next* request is blocked immediately; the existing session remains until then (same as S2's login-time check). E2E asserts the next protected call returns `403 ACCOUNT_SUSPENDED`.

**D6 — Organization status control mirrors D5** on `organizations.status` through the extended `organization` whitelist (`active ↔ suspended`); suspended orgs cannot publish because S6's publish route checks the org's `status` — no new gate needed (design reuses the existing enforcement; the E2E regression proves it).

**D7 — Approve is the F1 decision, written with the deciding admin recorded.** `POST /admin/organizations/:organizationId/verification/approve`:
1. Load the organization by id → 404 `ORGANIZATION_NOT_FOUND` if absent.
2. Load the latest `organization_verifications` row for the org **with `status: 'pending'`** (sort `submittedAt: -1`); none → 409 `NO_PENDING_VERIFICATION`.
3. Precondition: org `verificationStatus` must be `pending` (the `organizations` doc mirrors the submission's pending state; a `rejected` org resubmited to `pending` at S5, so the row and the doc are consistent; an already `verified` org → 409 `ORG_ALREADY_VERIFIED`).
4. `StatusTransitionService.assert({ entityType:'organization', entityId, from:'pending', to:'verified', actor })` → writes `status_histories`.
5. `updateOne` the org `{ $set: { verificationStatus: 'verified' } }`; `updateOne` the verification row `{ $set: { status:'verified', decidedAt: now, decidedBy: actor } }`.
6. Emit `DomainEvents.OrgVerificationUpdated` once with `{ organizationId: org._id }` (S9 handler shape — resolves the org and notifies its account). No rollback-transaction needed: the two row writes + one history + one emit are the same non-transactional envelope the S5 resubmit uses, and a re-approve is blocked by the `pending` precondition (step 3).

**D8 — Reject records the reason on the row and keeps the S5 resubmit path intact.** `POST /admin/organizations/:organizationId/verification/reject { rejectionReason }` (DTO `@IsString() @IsNotEmpty()` — 400 when absent): same load/precondition flow, then `assert` `pending → rejected`, org doc → `rejected`, verification row → `rejected` + `rejectionReason` + `decidedAt/decidedBy`, emit `org.verification.updated`. A rejected org can then call `POST /organizations/me/verification` (S5) → back to `pending` with a fresh row — the F1 loop closes. The reason lives on `organization_verifications.rejectionReason` (already an existing field — no schema change); `GET /organizations/me/verification` (S5) already surfaces it.

**D9 — Admin identity for tests.** There is no register path for role `admin` and the `seed:admin` script ships in Session 17. The admin E2E and the unit tests build the admin account through `UsersService.create({ email, passwordHash, role: 'admin' })`, then obtain a token via `POST /auth/login` (which accepts any role). Tests that don't need HTTP can call `AdminService` methods with an `{ sub, role: 'admin' }` account directly. This is the same seeding strategy S17 will codify.

**D10 — Route ordering for `GET /admin/organizations/verifications` before any new org-param routes.** The admin controller declares the static verifications listing without an id segment, so no shadowing; but it is declared before Part B's `opportunities`/`reports` controllers in the module to avoid any future `/admin/...` collision. Part A only owns `/admin/organizations` (list + status) and `/admin/organizations/verifications` (+ approve/reject under the org id) — no ambiguity because `/verifications` is a distinct literal segment.

## Risks / Trade-offs

- **Gate-freeze count approximates the S13 logic.** → The admin stats read the same §4 rule (distinct pending-review opportunities vs. threshold) at read-time without owning the gate service; it is a live indicator, not a stored metric. If Session 13 changes the gate math, the admin count is re-derived from the same rule and stays consistent by construction.
- **No Mongo transaction for approve/reject.** → A crash between the history write and the doc update could leave `status_histories` asserting a transition the row doesn't reflect. Mitigation: re-run of approve/precondition check is idempotent (step 3 requires `pending`; a partial write leaves the doc `pending` and the latest row `pending`, so a retry converges). Same non-transactional envelope accepted in S5/S11's submit/reject flows.
- **Admin `q` uses `$regex`.** → The query string is regex-escaped before interpolation and `role`/`status` are `@IsIn`-validated; the `(role,status)` index plus `email` regex is MVP-acceptable (F11 defers index tuning to S19).
- **Suspending an admin or the org that owns pending metrics has no guard.** → The inventory does not require one; a suspended admin simply stops being able to reach `/admin/*` (S1 guard). Recorded as accepted scope, not lost behavior.
- **N+1 in the volunteers list.** → Merging each page's profiles with their users via one `$in` query (D3) keeps it constant-time per page; the S19 N+1 scan mandate covers the whole codebase, this module already complies.

## Migration Plan

No new collections, indexes, or fields; no config. Deploy steps:
1. Add `AdminModule` to `app.module.ts` imports (append only, existing style preserved).
2. Extend the `organization` whitelist registration in `organizations.module.ts` (add two pairs) — the only edit to an existing module, additive.
3. Register the `user` whitelist in `AdminModule`.
Backward compatibility: no existing route changes; admin routes are new and inert until an admin account exists (S17). Rollback: revert the commit — `organization_verifications` rows and org documents merely carry fields their schemas already declared (no data migration).

## Open Questions

- **Gate-freeze threshold source.** The overview reads `publishGate.maxPendingOpportunities` from `system_settings` (default 3). Session 13 seeds the setting via the settings service; until then the default 3 applies. No blocking question.
- **Part B boundary.** This change stops at users/orgs/verification decisions. Session 16 adds the remaining `/admin/*` controllers to the same module and extends the same specs — no re-creation of the change.