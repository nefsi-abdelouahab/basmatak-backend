## 1. Module scaffolding and whitelists

- [x] 1.1 Create `backend/src/admin/admin.module.ts`: `@Module` importing `AuthModule`, `UsersModule`, `OrganizationsModule` (exported Mongoose models + `OrganizationsService`), and `MongooseModule.forFeature` for the read models needed by admin queries (`users`, `organizations`, `organization_verifications`, `volunteer_profiles`, `opportunities` if gate-freeze uses the aggregation pipeline over submissions, `submissions`, `system_settings`); providers for the stats/users/volunteers/organizations admin services; controllers per design D1
- [x] 1.2 Implement `AdminModule.onModuleInit` calling `registry.register('user', [['active','suspended'],['suspended','active']])` per design D4
- [x] 1.3 Extend the `organization` whitelist in `backend/src/organizations/organizations.module.ts` `onModuleInit` registration array to include `['active','suspended'],['suspended','active']` (append to the existing verification pairs; no other entity touched) per design D4
- [x] 1.4 Register `AdminModule` additively in `backend/src/app.module.ts` (append to imports; re-read the file first; preserve style, no reordering)

## 2. Admin stats overview

- [x] 2.1 Create `backend/src/admin/dto/admin-query.dto.ts` with validated query DTOs: `UsersQueryDto` (`role` `@IsIn(['volunteer','organization','admin'])` optional, `status` `@IsIn(['active','suspended','deleted'])` optional, `q` optional string, `limit`/`cursor` per cursor convention), `OrganizationsVerificationsQueryDto` (`status` default `pending` `@IsIn(['pending','verified','rejected'])`), others as needed — all whitelist + forbidNonWhitelisted
- [x] 2.2 Create `backend/src/admin/stats.service.ts`: `getOverview()` computing per design D2 — `counts` (`users`, `volunteers`, `organizations`, `verifiedOrganizations`, `opportunities`, `pendingVerifications`), `totalVolunteerHours` (aggregate sum of `volunteer_profiles.stats.volunteerHours`), `verificationRate` (verified ÷ total, `0` when no orgs), `gateFreezes` (distinct orgs locked per the §4 rule: distinct opportunities with ≥1 submission in `submitted|under_review` ≥ `publishGate.maxPendingOpportunities` from `system_settings` default 3)
- [x] 2.3 Create `backend/src/admin/stats.controller.ts` (`@Controller('admin/stats')` + `@Roles('admin')`) exposing `GET overview` returning `StatsService.getOverview()`
- [x] 2.4 Unit test `stats.service` (empty DB, hours accumulation, verification rate math, gate-freeze count with a locked + an open org)

## 3. Admin user routes

- [x] 3.1 Create `backend/src/admin/users.service.ts`: `list(query)` — filter `role`/`status`/`q` (escaped `$regex` on `email`, case-insensitive), exclude `-passwordHash`, cursor-paginate `_id` descending (default 20/max 50); `getById` → 404 `USER_NOT_FOUND` when absent; `setStatus(account, userId, status)` per design D5 (404 load, `deleted` → 409, no-op → 409, `StatusTransitionService.assert` then `updateOne`)
- [x] 3.2 Create `backend/src/admin/users.controller.ts` (`@Controller('admin/users')` + `@Roles('admin')`): `GET ''` list, `GET ':userId'` detail, `PATCH ':userId/status'` with a `{ status }` DTO (`@IsIn(['active','suspended'])`)
- [x] 3.3 Unit tests: list filters + pagination + no-password-hash projection; status control — suspend writes history + updates doc, reinstate works, `deleted` no-op 409, unknown user 404, invalid `status` 400
- [x] 3.4 Verify `audit_logs` entry is created for `PATCH /admin/users/:userId/status` and `GET /admin/users` (S1 interceptor covers admin actions; unit test asserts a row exists after an admin mutation)

## 4. Admin volunteers and organizations

- [x] 4.1 Create `backend/src/admin/volunteers.service.ts` + controller (`@Controller('admin/volunteers')` + `@Roles('admin')`): cursor-paginated `volunteer_profiles` joined per-page with linked `users` via one `$in` fetch (no N+1, per D3); expose `GET ''`
- [x] 4.2 Create `backend/src/admin/organizations.service.ts` (admin) + controller (`@Controller('admin/organizations')` + `@Roles('admin')`): `list()` paginated over all orgs (no verification/status filter — every org listed), `listVerifications(status)` reading `organization_verifications` (default `pending`, oldest-first by `submittedAt`) enriched with org summaries via `$in` (design D3); `setStatus(account, organizationId, status)` mirroring D6 through the extended `organization` whitelist; `approve(account, organizationId)` and `reject(account, organizationId, rejectionReason)` per design D7/D8
- [x] 4.3 Expose the routes: `GET ''`, `GET 'verifications?status='`, `PATCH ':organizationId/status'`, `POST ':organizationId/verification/approve'`, `POST ':organizationId/verification/reject'` (declare `verifications` listing before any `:organizationId` route; DTO `{ rejectionReason }` required non-empty — 400 when absent)
- [x] 4.4 Implement approve (D7): 404 org, `NO_PENDING_VERIFICATION` 409 when no pending row, `ORG_ALREADY_VERIFIED` 409 when org already verified, `assert pending→verified`, org → `verified`, verification row → `verified` + `decidedAt`/`decidedBy`, emit `DomainEvents.OrgVerificationUpdated` with `{ organizationId }` exactly once
- [x] 4.5 Implement reject (D8): same precondition flow, `assert pending→rejected`, org → `rejected`, row → `rejected` + `rejectionReason` + `decidedAt`/`decidedBy`, emit `org.verification.updated`
- [x] 4.6 Unit tests: organization status control (suspend writes history/updates doc, reinstate, no-op/deleted 409, invalid value 400); approve sets the right fields/events (assert row `verified` with `decidedBy`, org `verified`, one `org.verification.updated` emission, exactly one `status_histories` row); reject sets reason + fields + event; preconditions (`NO_PENDING_VERIFICATION`, `ORG_ALREADY_VERIFIED`, 404, 400 missing reason)

## 5. E2E tests (`backend/test/admin.e2e-spec.ts`)

- [x] 5.1 Create the spec scaffolding on the memory rig: register org/volunteer via HTTP, create the admin user through `UsersService.create` (role `admin`) and log in (design D9); helpers to seed `organization_verifications` rows and org docs
- [x] 5.2 Non-admin isolation: volunteer and organization accounts calling every admin route (`GET /admin/stats/overview`, `GET /admin/users`, `PATCH .../status`, `GET /admin/volunteers`, `GET /admin/organizations`, `GET .../verifications`, approve/reject, org status) receive `403`; guest receives `401`
- [x] 5.3 Admin lists: `GET /admin/users?role=volunteer&status=active&q=` returns only matches with no password hash; pagination navigates the full set; `GET /admin/volunteers` and `GET /admin/organizations` cover all rows; `GET /admin/organizations/verifications?status=pending` returns oldest-first pending rows with org summaries
- [x] 5.4 Suspend volunteer → their `GET /users/me` (or any protected call) returns `403 ACCOUNT_SUSPENDED` (S1 regression); `PATCH /admin/users/:userId/status` back to `active` restores access
- [x] 5.5 Suspend org → attempted publish returns `403` (S6 regression); reinstate → publish allowed again
- [x] 5.6 F1 unblock end-to-end: register org (pending), submit verification docs, admin `approve` → org `verified` → org publishes an opportunity successfully (`201`); assert an `org.verification.updated` notification row exists for the org account
- [x] 5.7 Reject loop: admin `reject` with a reason → org `rejected` + reason surfaced; org resubmits (`POST /organizations/me/verification`) → back to `pending`; preconditions exercised (approve without pending row → 409, approve already-verified → 409, reject missing reason → 400)

## 6. Verification and wrap-up

- [x] 6.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green
- [x] 6.2 From the repo root: `openspec validate admin-and-moderation` and `openspec status --change admin-and-moderation` (shared change, Part A artifacts valid)
- [x] 6.3 Stage only this change's files (backend/src/admin/**, backend/src/app.module.ts, backend/src/organizations/organizations.module.ts, backend/test/admin.e2e-spec.ts, openspec/changes/admin-and-moderation/**); never `git add -A`; leave other changes untouched; commit `feat(admin): users, organizations, and verification decisions (part A)`
- [x] 6.4 Confirm the change is NOT archived (Part B in Session 16 archives it; this session only reports the shared status)

> Session 15 note: 6.1 "all green" holds for this change (build, lint, unit 250/250, admin e2e 24/24). The combined e2e run shows 2 suite-level failures from OTHER sessions' uncommitted working-tree code (new portfolio.e2e-spec.ts; a teardown race in verifications.e2e-spec.ts from the uncommitted TrustPublishGateService override in common.module.ts) - none touched by this change's files.