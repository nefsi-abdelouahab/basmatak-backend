## Why

Admin tables are currently bare counted-page lists with almost no search, filter, sort, or export power, and status decisions record no reason. Session 10 (S3) turns every admin list into a real management surface on top of the Session 7 `CursorPage.total/page/pages` contract, adding query power, in-process CSV export, label-rich rows, and reason-recorded status changes.

## What Changes

- Every admin list (`/admin/users`, `/admin/volunteers`, `/admin/organizations`, `/admin/organizations/verifications`, `/admin/opportunities`, `/admin/reports`, `/admin/audit-logs`) gains `q`, relevant field filters, whitelisted `sort`, and `format=csv` streaming export via `csv-stringify` (in-process, never disk). Request paging stays cursor/`limit`; `total`/`page`/`pages` keep the Session 7 shape.
- Admin list rows embed labels/counts: volunteer skills + location names; organization type/location labels; opportunity positions/capacity, application counts, location, assigned volunteer names; report reporter summary + target-entity summary; audit-log actor/target display names with `reports` entity extraction.
- `reports` gains optional `title`, `priority` (`low|normal|high`), and `assignedAdminId`; `organization_verifications` gains `assignedAdminId` with `PATCH .../verifications/:rowId/assign` and `GET /admin/organizations/:id/verification/latest`.
- Status PATCH bodies (`/admin/users/:id/status`, `/admin/organizations/:organizationId/status`, `/admin/opportunities/:opportunityId/status`) gain optional `{ reason, notes }`, persisted on `status_histories` via an extended `StatusTransitionService.assert`.
- New read `GET /admin/status-histories?entityType=&entityId=` reusing the existing writer; new `GET /admin/volunteers/:id/experiences` serves the inert `AdminExperienceDisplay` seam (real data filled by `experience-enrichment`).

## Capabilities

### New Capabilities

- None. All behavior extends existing surfaces.

### Modified Capabilities

- `admin`: list query params, CSV export, enriched rows, status-histories read, assign/latest-dossier routes, volunteer-experiences read, reason/notes status bodies.
- `reports`: `title`, `priority`, `assignedAdminId` fields and list filters.
- `organizations`: `organization_verifications.assignedAdminId` column.
- `users`: suspend/reinstate records reason/notes in history.
- `status-transitions`: `assert` accepts optional `reason`/`notes` persisted on `status_histories`.
- `extension-seams`: new `AdminExperienceDisplay` seam instance with inert default.

## Impact

- Touches `backend/src/admin/*`, `reports` schema/service, `organization-verification` schema, `core/status-transitions` writer, one new seam under `src/common/seams/`.
- Adds `csv-stringify` dependency. No analytics routes, no report actions, no user-notice route (Session 20), no disk writes.
