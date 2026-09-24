## 1. Dependencies and shared CSV helper

- [x] 1.1 Install `csv-stringify` in `/backend` and verify it resolves under the Nest build
- [x] 1.2 Add shared in-process CSV streaming helper (filter → rows → `csv-stringify` → response, header row, RFC 4180 escaping, no disk writes) with unit tests for escaping and headers

## 2. Status history reason/notes foundation

- [x] 2.1 Extend `status_histories` schema with optional `reason` (≤500) and `notes` (≤2000)
- [x] 2.2 Extend `StatusTransitionService.assert` with optional `reason`/`notes` persisted on the entry; unit-test valid/oversized/invalid-transition paths
- [x] 2.3 Extend admin status DTOs (`UserStatusDto`, `OrganizationStatusDto`, `OpportunityStatusDto`) with optional `reason`/`notes` and wire through `setStatus` paths

## 3. Admin list query params (q / filters / sort / format)

- [x] 3.1 Extend admin query DTOs with `q`, per-list field filters, whitelisted `sort`, `pageSize` (alias of `limit`), and `format` (`json|csv`) under `forbidNonWhitelisted`
- [x] 3.2 Volunteers list: `q`/`wilayaId`/`municipalityId`/`skillId` (multi-value)/`from`/`to` filters + sort + skills/location/`lastActivityAt` joins via `execPage` mapper
- [x] 3.3 Users list: add `sort` (existing `role`/`status`/`q` unchanged)
- [x] 3.4 Organizations list: `q`/`type`/`wilayaId`/`municipalityId`/`verificationStatus`/`status` filters + sort (field-absence-tolerant reads, no fact writes)

## 4. Verification assignment and latest dossier

- [x] 4.1 Add `assignedAdminId` to `organization_verifications` schema + `(assignedAdminId, status)` index
- [x] 4.2 Add `PATCH /admin/organizations/verifications/:rowId/assign` with admin-assignee validation + `assignedAdminId` filter on the verifications list
- [x] 4.3 Add `GET /admin/organizations/:id/verification/latest` (newest by `submittedAt`, `404` when none)

## 5. Opportunity list enrichment

- [x] 5.1 Opportunities list: `q`/`status`/`organizationId` filters + sort + positions/capacity/filled, application counts, location labels, assigned volunteer names (batched joins)

## 6. Reports enrichment and assignment

- [x] 6.1 Add `title`/`priority`/`assignedAdminId` to `reports` schema + `(priority,status)` and `(assignedAdminId,status)` indexes; accept on create/patch DTOs within bounds
- [x] 6.2 Reports list: `q`/`targetType`/`priority`/`assignedAdminId`/`from`/`to` filters + sort + reporter summary + target-entity summary joins
- [x] 6.3 Add `PATCH /admin/reports/:id/assign` with admin-assignee validation

## 7. Audit logs and status-histories reads

- [x] 7.1 Audit-logs list: actor/target display-name joins (batched) + `reports` entity extraction + `q` filter + sort
- [x] 7.2 Add `GET /admin/status-histories?entityType=&entityId=` read reusing the existing writer (required params, oldest-first, no writes)

## 8. Experience seam and volunteer experiences read

- [x] 8.1 Add `AdminExperienceDisplay` seam (interface + inert empty-page default) bound in `AdminModule`
- [x] 8.2 Add `GET /admin/volunteers/:id/experiences` via the seam (`404` unknown volunteer, empty page while inert)

## 9. Tests and verification

- [x] 9.1 Unit tests: CSV helper, reason/notes persistence, assign validation, sort-whitelist rejection
- [x] 9.2 E2E tests: each admin list filtered totals + CSV (content-type + header row), suspend-with-reason visible in histories, assign + latest-dossier flows, non-admin `403` everywhere
- [x] 9.3 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`, then `openspec validate backend-v2-admin-lists` from root
