## 1. Reports module (catch-up module 21)

- [x] 1.1 Create `backend/src/reports/report.schema.ts`: fields `reporterId` (ObjectId required), `targetType` (enum `opportunity|user|organization|review|submission`, required), `targetId` (ObjectId required), `reason` (String required, trim), `description` (String optional), `status` (enum `open|in_review|resolved|dismissed`, default `open`), `resolution` (String optional); timestamps via `createSchema`; indexes `(status, createdAt)` and `(targetType, targetId)` per §3 (design D5)
- [x] 1.2 Create `backend/src/reports/reports.service.ts` + `backend/src/reports/reports.controller.ts`: `create(account, dto)` storing `reporterId = account.sub`, status `open`, return the row; `POST /reports` controller (no `@Roles`, global JWT auth) with the `CreateReportDto` (`targetType` `@IsIn([...])`, `targetId` `@IsMongoId`, `reason` `@IsString @IsNotEmpty @MaxLength(2000)`, `description` optional `@MaxLength(4000)`) per design D6
- [x] 1.3 Create `backend/src/reports/reports.module.ts` implementing `OnModuleInit` to register the `report` whitelist `open → in_review|resolved|dismissed`, `in_review → resolved|dismissed` (design D5)
- [x] 1.4 Wire `ReportsModule` additively into `backend/src/app.module.ts` imports (append only, per D10)

## 2. Admin module wiring

- [x] 2.1 Create `backend/src/admin/dto/admin-part-b.dto.ts` with query/body DTOs following the `admin-query.dto.ts` pattern: `StatusDto` (`status` `@IsIn(['closed','cancelled'])`), `ReportsQueryDto` (optional `status` `@IsIn(['open','in_review','resolved','dismissed'])`, `cursor`, `limit`), `ReportStatusDto` (`status` required `@IsIn(['in_review','resolved','dismissed'])`, `resolution` optional), `AuditLogsQueryDto` (`actor`/`entityType`/`entityId` optional strings, `date` optional `@IsDateString`, `cursor`, `limit`), `SettingsValueDto` (`value` required, numeric for known keys)
- [x] 2.2 Append controllers `AdminOpportunitiesController`, `AdminReviewsController`, `AdminReportsController`, `AdminAuditController`, `AdminSettingsController` and their services to `backend/src/admin/admin.module.ts`, plus `MongooseModule.forFeature` entries for `reviews`, `reports`, `audit_logs`, `system_settings` (opportunities already present); keep `@Roles('admin')` + `@Controller('admin/...')` on each (design D1/D10)

## 3. Admin opportunities

- [x] 3.1 Create `backend/src/admin/opportunities.service.ts` + controller: `GET /admin/opportunities` — cursor-paginated newest-first (`_id` desc) projection (default 20 / max 50 via `normalizeLimit`, cursor via `buildCursor`) with no extra indexes (design D2)
- [x] 3.2 Implement `setStatus(account, opportunityId, status)`: load → `404 OPPORTUNITY_NOT_FOUND`; equal current → `409 INVALID_STATUS_TRANSITION` (no-op); else `StatusTransitionService.assert({ entityType:'opportunity', from: current, to: requested, actor })` using the existing S6 whitelist and update `{ status }` (design D3); expose `PATCH /admin/opportunities/:opportunityId/status` with the `StatusDto`

## 4. Review hiding

- [x] 4.1 Edit `backend/src/reviews/review.schema.ts` additively: add `status: { type: String, enum: ['visible','hidden'], default: 'visible' }` to the field map and the `Review`/`ReviewModel` interfaces; keep the three existing indexes (design D4)
- [x] 4.2 Create `backend/src/reviews/review-status.service.ts` (or admin reviews service) implementing `hide(reviewId)`: load → `404 REVIEW_NOT_FOUND`; already `hidden` → `409`; update `{ status: 'hidden' }`; expose `PATCH /admin/reviews/:reviewId/hide` in `AdminReviewsController` (admin, audited by interceptor)
- [x] 4.3 Edit `backend/src/trust/reliability.service.ts` ONLY where S13 wrote the review reads: add `.where('status').ne('hidden')` to BOTH the org-review query and the platform-review query in `computeFor` (so hidden reviews are excluded from the org average and the anomaly comparison), keeping `deriveMetrics`/`anomalyFlag` signatures unchanged (design D4; do not touch any other file under `src/trust/`)

## 5. Admin reports

- [x] 5.1 Create `backend/src/admin/reports.service.ts`: `list(query)` — cursor-paginated (newest-first) over `reports` with optional `status` filter; `resolve(account, reportId, dto)` — load → `404 REPORT_NOT_FOUND`, `StatusTransitionService.assert({ entityType:'report', from: current, to, actor })` (409 for illegal/no-op via whitelist), set `{ status, ...(resolution) }`
- [x] 5.2 Expose routes in `AdminReportsController`: `GET /admin/reports?status=` and `PATCH /admin/reports/:reportId` with the corresponding DTOs (design D6)

## 6. Admin audit-log browsing

- [x] 6.1 Create `backend/src/admin/audit.service.ts` + `AdminAuditController`: `GET /admin/audit-logs` — read-only, cursor-paginated newest-first over `audit_logs`; build the filter from `actor` (ObjectId → `400` when malformed, designs map `actorId`), `entityType`/`entityId` (map to the `(entityType, entityId)` index), `date` (`createdAt <= end of day`); no writes, no schema/index changes (design D7)

## 7. Admin settings

- [x] 7.1 Create `backend/src/admin/settings.service.ts` + `AdminSettingsController`: `GET /admin/settings` — `find({})` listing all `system_settings` rows (design D8)
- [x] 7.2 Implement `PUT /admin/settings/:key`: whitelist `key` (known: `publishGate.maxPendingOpportunities`) else `400 UNKNOWN_SETTING_KEY`; validate `value` shape (finite number for the numeric threshold) else `400`; call `SettingsService.set` (upsert + cache refresh); return the stored setting (design D8)

## 8. Unit tests

- [x] 8.1 `backend/src/reports/reports.service.spec.ts`: create stores `reporterId` + default `open`; report status flow (open → in_review → resolved/dismissed accepted; `resolved → open`, no-op, and other illegal transitions rejected `409` with no history row)
- [x] 8.2 `backend/src/admin/settings.service.spec.ts` (or spec for the controller service): upsert writes + cache invalidation — `set` then immediate `get` returns the new value; unknown key → `400`; wrong value shape → `400`
- [x] 8.3 Reliability hidden-review exclusion unit test (extend `backend/src/trust/reliability.service.spec.ts`): a review with `status: 'hidden'` is excluded from `deriveMetrics`/`anomalyFlag` inputs — org avg and platform avg match the visible-only set
- [x] 8.4 Admin opportunity/report/audit service unit tests: opportunity status transitions + `404`/no-op `409`; report resolve paths + `REPORT_NOT_FOUND`; audit filter builder maps `actor`/`entity`/`date` to the right query shape

## 9. E2E tests (`backend/test/admin-part-b.e2e-spec.ts`)

- [x] 9.1 Scaffold on the memory rig: build the admin via `UsersService.create({ email, passwordHash, role: 'admin' })`, obtain ONE shared token via `POST /auth/login` (reused across the suite), set `THROTTLE_LIMIT=100000` in the app-creating helper (Part A D9 pattern); helpers to register volunteer/org accounts, create a review, and seed opportunities/reports
- [x] 9.2 Volunteer reports an org: `POST /reports` creates a row with `reporterId`; admin lists via `GET /admin/reports` and resolves (`PATCH ... :reportId` → `resolved` with `resolution`); invalid transitions return `409`; non-admin calls to `GET /admin/reports`/`PATCH` return `403`
- [x] 9.3 Review hiding: admin `PATCH /admin/reviews/:reviewId/hide` → status `hidden`; reliability + anomaly queries exclude it (assert org reliability average and anomaly flag match the visible-only set); hide again → `409`
- [x] 9.4 Audit-log filter: perform an admin action, then `GET /admin/audit-logs?actor=<adminId>` returns that row and `?entityType=&entityId=`/`?date=` narrow correctly
- [x] 9.5 Force-close an opportunity: seed an `in_progress` opportunity, `PATCH /admin/opportunities/:id/status { status: 'closed' }` → `opportunity.status` becomes `closed` with a `status_histories` row; draft or no-op → `409`; unknown → `404`
- [x] 9.6 Settings + publish-gate regression (S13): `PUT /admin/settings/publishGate.maxPendingOpportunities` → `1`, then a second org with pending submissions hits `PUBLISH_GATE_LOCKED` when publishing (gate threshold read via `SettingsService`); `GET /admin/settings` lists it; unknown key → `400`

## 10. Verification and wrap-up

- [x] 10.1 From `/backend`: `npm run build`, `npm run lint`, `npm test` (keep all 250 passing) — green
- [x] 10.2 Run the isolated e2e: `npm run test:e2e -- --forceExit --runInBand --no-cache --testPathPattern=admin-part-b` — green (ignore the combined suite's known failures from other sessions' uncommitted code)
- [x] 10.3 From the repo root: `openspec validate admin-moderation-part-b` and `openspec status --change admin-moderation-part-b` — valid, all artifacts done
- [x] 10.4 Stage only this change's files (backend/src/reports/**, backend/src/admin/** new+edited, backend/src/reviews/review.schema.ts, backend/src/trust/reliability.service.ts, backend/src/app.module.ts, backend/test/admin-part-b.e2e-spec.ts, openspec/changes/admin-moderation-part-b/**); never `git add -A`, never touch other sessions' or docs/inventory files; commit `feat(admin): opportunities, reports, audit-logs, settings (part B)`