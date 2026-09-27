## Why

Admins currently have no frontend surface for the backed Reports & Moderation queue (V2 §B#22) or the real Admin Settings keys (V2 §B#23): report triage with atomic resolve-with-action and the stored/validated settings surface (incl. the maintenance toggle) exist only as backend routes. Session F16 closes that gap with two admin-only routes.

## What Changes

- ADDED route `admin/reports`: enriched report triage list (status/targetType/priority/assignedAdminId/q/from/to/sort filters, cursor paging, totals, CSV export via the shared blob helper), per-report detail with reporter/target summaries, assign-to-admin, and atomic resolve-with-action (`in_review` / `resolved` + required `resolution` / `dismissed`, neutral action vocabulary only).
- ADDED route `admin/settings`: full settings table from `GET /admin/settings` (every row is a stored validated key), per-key edit via `PUT /admin/settings/:key` with per-key type validation, maintenance toggle via `POST /admin/ops/maintenance`, live system-status read via public `GET /system/status` with a maintenance → public-503 spot-check note.
- ADDED `lib/api/adminModeration.ts` (one typed function per endpoint) + `hooks/useAdminModeration.ts` (TanStack Query only) + `messages/admin-moderation/{en,ar}.json` (own prefix `adminModeration`, auto-merged; `src/i18n/request.ts` untouched).
- Neutral action vocabulary only (`unpublish_opportunity`, `close_opportunity`, `suspend_target`, `notice`); forbidden sanction vocabulary ("Statutory Sanction", "100% compliance", "Contact Secretariat") appears nowhere.
- Report resolution is atomic resolve-with-action: every consequence is asserted via re-read of the affected entity (or its status-history), never assumed from the mutation response alone.

## Capabilities

### New Capabilities
- `admin-moderation-reports`: admin report triage list, assign, atomic resolve-with-action, standalone notice, review-hide.
- `admin-moderation-settings`: admin settings table, per-key validated edit, maintenance toggle, system-status read.

### Modified Capabilities
<!-- None: this change introduces new frontend capabilities only; backend specs (reports, moderation-actions, system-settings, system-status, admin) are consumed read-only, never modified. -->

## Impact

- Frontend only: new route dirs `src/app/[locale]/admin/reports` + `src/app/[locale]/admin/settings`, new `src/lib/api/adminModeration.ts`, new `src/hooks/useAdminModeration.ts`, new `src/messages/admin-moderation/` catalog pair, new unit/component/e2e tests. Consumes F0 theme/i18n/api-client/query-keys/blob-helper untouched.
- Backend untouched (`/backend`, `docs/API.md`, `backend-inventory.md` unchanged). Out of scope: F14 analytics, F15 manage tables. Non-admin callers get the shared 403 state; maintenance enforcement is read-only here (toggle writes + status reads) — the 503 gate itself stays backend-owned.
