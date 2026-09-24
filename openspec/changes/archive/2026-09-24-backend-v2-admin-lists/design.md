## Context

Session 10 (S3, `backend-v2-admin-lists`) upgrades all seven admin lists from the bare counted pages Session 7 left behind ("bare totals only") into filterable, sortable, CSV-exportable management surfaces with label-rich rows and reason-recorded status changes. Current state (verified against `backend/src`): every admin list already returns `CursorPage` with `total`/`page`/`pages` via hand-rolled cursor code; `VolunteersQueryDto`/`OrganizationsListQueryDto`/`OpportunitiesQueryDto` carry only `cursor`+`limit`; `status_histories` has no `reason`/`notes` and `StatusTransitionService.assert` accepts none; `reports` has no `title`/`priority`/`assignedAdminId`; `organization_verifications` has no `assignedAdminId`; `csv-stringify` is not installed; organizations have no `type`/location fields yet (owned by `org-facts`, a later session). S3 peer `public-exposure` touches volunteers+reviews only — file-disjoint from this change.

## Goals / Non-Goals

**Goals:**

- `q`/field-filters/`sort`/`format=csv` on all seven admin lists reusing the Session 7 page shape.
- In-process CSV streaming, enriched rows, `assignedAdminId` flows, reason/notes status bodies, status-histories read, inert `AdminExperienceDisplay` seam.
- `reports.title`/`priority`/`assignedAdminId` and `organization_verifications.assignedAdminId` columns with indexes.

**Non-Goals:**

- Any change to `admin-analytics` routes/files (Session 8, archived) or analytics semantics.
- Report resolutions/actions, `POST /admin/users/:userId/notice`, opportunity close/unpublish admin routes (Session 20 `moderation-actions`).
- A second pagination mechanism; new organizations fact fields (`org-facts` owns them); messaging.

## Decisions

### Stay on the Session 7 page shape; `pageSize` aliases `limit`

Request paging stays `cursor` + `limit` (default 20, max 50 via `normalizeLimit`); `total`/`page`/`pages` response fields are untouched. The roadmap's `page=`/`pageSize=` are honored as: `pageSize` accepted as an alias of `limit` (same cap), `page` response-only (cursor owns position). Alternative (offset paging) rejected — the session brief forbids a second pagination mechanism. Sort is a whitelisted token per list mapping to a deterministic mongoose sort with `_id` tie-break, recorded via `execPage`'s `sortToken`; unknown tokens are `400`. Admin services SHOULD migrate to the shared `execPage` helper where it fits; joins apply in the `mapper`.

### CSV streams in-process with the JSON filter path

`format=csv` reuses the exact base filter + sort of the JSON variant, then streams rows through `csv-stringify` to the Express response (`text/csv`, `Content-Disposition: attachment; filename=<list>-<date>.csv`). No temp files (Render free has no disk). Exact per-list column sets are Open Questions; the rule is flat scalar projection of the enriched row, RFC 4180 escaping (covered by unit test).

### Reason/notes ride the existing writer

`StatusTransitionService.assert` gains optional `reason` (≤500)/`notes` (≤2000), persisted on `status_histories` (schema gains both optional fields). Admin status DTOs (users/organizations/opportunities) gain the same optional pair; validation rejects oversize with `400` before any write. Report triage keeps `resolution` as its notes-equivalent (no duplicate field).

### Assignment is a validated reference, nothing more

`assignedAdminId` is an ObjectId validated at assign time against an existing `admin`-role user (missing row `404`, bad assignee `400`); assignment itself is audited by the admin interceptor. Reassign overwrites; whether unassign/self-assign-only rules exist is an Open Question. Reports get a symmetric `PATCH /admin/reports/:id/assign` (RP names no route; Session 20 later extends `PATCH /admin/reports/:id` with actions — the assign route stays separate and untouched by that).

### Joins stay batched; org fact filters stay defensive

All label joins (skills, wilaya/municipality names, reporter/target summaries, display names, app counts, assigned names) resolve with one `$in` fetch per referenced collection per page — never N+1. `organizations.type`/location filters read the fields only when present (`org-facts` owns them; this change adds no organization fact columns and MUST NOT add `registryId`-adjacent or fact-sheet writes). New indexes only: `reports(priority,status)`, `reports(assignedAdminId,status)`, `organization_verifications(assignedAdminId,status)`.

### Seam follows the house convention

`AdminExperienceDisplayProvider` + `InertAdminExperienceDisplayProvider` (empty counted page) live in `src/common/seams/`, bound in `AdminModule`; `experience-enrichment` swaps the real provider via DI.

## Risks / Trade-offs

- [Risk] CSV over large collections could hold a cursor long → Mitigation: same `limit` cap per request as JSON; no unbounded export.
- [Risk] Enriched rows add per-page join queries → Mitigation: constant queries per page, covered by e2e perf smoke; no new per-row queries.
- [Risk] Sort tokens and CSV columns invented without owner input → Mitigation: Open Questions below; specs intentionally leave both whitelists unenumerated so confirmation needs no re-spec.
- [Risk] `org-facts` later adds real `type`/location fields → Mitigation: admin filters are read-only and field-absence-tolerant; no migration needed.

## Migration Plan

No migration: all columns optional with defaults (`priority=normal`, `assignedAdminId` unset, `reason`/`notes` unset). Deploy = merge commit; rollback = revert commit. `npm i csv-stringify` at implementation time.

## Open Questions

1. **CSV column set per list (confirmation needed — not invented):** proposed: users `(id,email,phone,role,status,lastActivityAt,createdAt)`; volunteers `(profileId,username,fullName,email,status,skills,wilaya,municipality,lastActivityAt)`; organizations `(id,slug,nameFr,nameAr,registryId,type,verificationStatus,status,assignedDossier?)`; verifications `(rowId,orgId,orgSlug,status,assignedAdminId,submittedAt,decidedAt)`; opportunities `(id,slug,title,status,orgName,positions,capacity,filled,applications,location)`; reports `(id,title,targetType,targetId,reporter,priority,status,assignedAdminId,createdAt)`; audit-logs `(id,actorName,action,method,path,entityType,entityId,createdAt)`. Confirm or amend.
2. **Sort vocabulary per list (confirmation needed):** proposed minimal: every list `newest` (default) + `oldest`; volunteers +`name`; organizations +`name`; opportunities +`title`; reports +`priority`. Confirm or amend.
3. **`assignedAdminId` assignment rule (confirmation needed):** proposed: any admin may assign any admin (incl. self), reassign overwrites, no unassign endpoint (assign to null rejected). Confirm or amend.
4. **Reports assign route:** proposed dedicated `PATCH /admin/reports/:id/assign` (keeps Session 20's action body clean). Confirm, or fold assignment into `PATCH /admin/reports/:id`.
