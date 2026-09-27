## Why

Admins cannot moderate the platform's population: delta doc V2 §B#19–§B#21 confirms Manage Volunteers, Manage Organizations (incl. verification triage), and Manage Opportunities are blocked on admin list/query power (`q`/filters/`sort`/`page`/`pageSize`, totals, CSV), label/count embeds, status-with-reason, officer assignment, latest-dossier reads, approve/reject decisions, and force-close via status-PATCH. Without them, admins cannot inspect accounts, triage the verification queue, or close abusive opportunities.

## What Changes

- New route `admin/volunteers`: admin volunteer table (`?q=&wilayaId=&municipalityId=&skillId=&from=&to=&sort=&page=`), skill/location labels + `lastActivityAt`/email-verified joins, totals + CSV, per-volunteer verified-experiences read (latest engagement), user status control (`active|suspended` + `{reason, notes}`), system notice send, status-history view. Real vocabularies only (`active|suspended|deleted` — no "Pending").
- New route `admin/organizations`: admin org table (`?q=&type=&wilayaId=&municipalityId=&verificationStatus=&status=&sort=&page=`), totals + CSV, org status control with `{reason, notes}`, status-history view.
- New route `admin/verifications`: pending-first verification triage queue (`?status=&assignedAdminId=&page=`), officer assignment (`{assignedAdminId}`), latest-dossier read per org with dossier media render, neutral "Approve verification" / "Reject with reason" decisions (`{rejectionReason}` required). "Request Info" and "Grant Law 12-06 Seal" stay deleted.
- New route `admin/opportunities`: admin opportunity table (`?q=&status=&organizationId=&sort=&page=`), positions/capacity + application counts + location labels + assigned names, totals + CSV, force-close via `PATCH .../status` (`closed|cancelled` + `{reason, notes}`), never a close POST (§A#16).
- New API module `lib/api/adminLists.ts` + hook file `hooks/useAdminLists.ts`; catalogs `messages/admin-manage/{en,ar}.json` under prefix `adminManage.*`. Non-admin visits render 403.

## Capabilities

### New Capabilities
- `admin-volunteers`: volunteer list query power, label/count embeds, experiences read, user status-with-reason, notice send, histories read.
- `admin-organizations`: org list query power, org status-with-reason, histories read.
- `admin-verifications`: verification queue, officer assignment, latest-dossier read, approve/reject decisions.
- `admin-opportunities`: opportunity list enrichment, force-close via status-PATCH.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 4 routes, 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme/i18n/api-client/blob-helper/primitives + FB session guard (no edits to shared or archived files).
- Depends on FB (archived); parallel-safe with F14/F16 (disjoint route dirs, `adminLists.ts`/`useAdminLists.ts`, `adminManage.*` prefix). Reports/moderation composite actions stay in F16; settings stay in F16.
- Backend endpoints consumed (base `/api/v1`): `GET /admin/volunteers`, `GET /admin/volunteers/:volunteerId/experiences`, `GET /admin/users/:userId`, `PATCH /admin/users/:userId/status` (`{status, reason?, notes?}`), `POST /admin/users/:userId/notice` (`{message}`), `GET /admin/organizations`, `GET /admin/organizations/verifications` (`?status=&assignedAdminId=`), `GET /admin/organizations/:organizationId/verification/latest`, `PATCH /admin/organizations/verifications/:rowId/assign` (`{assignedAdminId}`), `PATCH /admin/organizations/:organizationId/status`, `POST /admin/organizations/:organizationId/verification/approve|reject` (`{rejectionReason}` on reject), `GET /admin/opportunities`, `PATCH /admin/opportunities/:opportunityId/status` (`{status, reason?, notes?}`), `GET /admin/status-histories` (`?entityType=&entityId=`), `GET /media/:mediaId` (dossier read).
