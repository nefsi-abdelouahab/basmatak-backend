## Why

Session 15 (Part A) built the account-moderation backbone; the other half of `§2.20` remains unimplemented: moderators have no way to control opportunities, hide abusive reviews, triage user-submitted reports, browse the audit trail, or tune the publish-gate threshold. The `reports` change promised in P3 also has no module yet. This session closes `admin-and-moderation` (Part B) and the `reports` module (module 21).

## What Changes

- `GET /admin/opportunities` (cursor-paginated, newest-first) and `PATCH /admin/opportunities/:opportunityId/status` (force `published|in_progress → closed|cancelled` through `StatusTransitionService`, 404 on absent, 409 on invalid/no-op).
- `PATCH /admin/reviews/:reviewId/hide` — sets `reviews.status = hidden`; adds a `status` field (`visible` default | `hidden`) to the `Review` schema; hidden reviews are excluded from the org reliability computation and the platform-average anomaly comparison.
- `POST /reports` (any logged-in role; `targetType, targetId, reason, description`, records `reporterId`), `GET /admin/reports` (`?status=` filter, paginated), `PATCH /admin/reports/:reportId` (`{ status, resolution }` via a report whitelist `open → in_review → resolved | dismissed`).
- `GET /admin/audit-logs?actor=&entity=&date=` (read-only over `audit_logs`), `GET /admin/settings`, `PUT /admin/settings/:key` (upsert through `SettingsService`; validated known keys so the publish gate picks up the new threshold).
- New `backend/src/reports/` module (module 21) owning the `reports` collection; `POST /reports` lives there; admin list/resolve routes live in `AdminModule`.

## Capabilities

### New Capabilities
- `reports`: the reports collection, user-submitted `POST /reports`, and the `open → in_review → resolved | dismissed` transition with admin resolution.

### Modified Capabilities
- `admin`: opportunity listing/status control, review hiding, report management, audit-log browsing, and settings management under `/admin/*`.
- `reviews`: a `status` field (`visible | hidden`) and the exclusion of hidden reviews from reliability and anomaly metrics.
- `system-settings`: the admin settings read/write controller deferred from Session 1 (list all keys + upsert by key).

## Impact

- Backend: new `backend/src/reports/` module (`ReportsModule`, schema, service, `POST /reports` controller); new `AdminOpportunitiesController`, `AdminReviewsController`, `AdminReportsController`, `AdminAuditController`, `AdminSettingsController` in `backend/src/admin/admin.module.ts`; additive Mongoose `forFeature` registrations; additive import in `app.module.ts`; `status` field added to `review.schema.ts`; reliability/`anomalyFlag` in `src/trust/reliability.service.ts` excludes hidden reviews.
- Tests: unit (report status flow, settings upsert + cache invalidation, hidden-review exclusion) and E2E `backend/test/admin-part-b.e2e-spec.ts`.
- No new packages, env vars, or collections beyond `reports`.