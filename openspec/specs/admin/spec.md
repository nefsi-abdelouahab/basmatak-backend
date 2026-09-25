# admin Specification

## Purpose
Admin moderation surface: stats overview, user/volunteer/organization management, organization verification approve/reject, force close/cancel of opportunities, review hiding, report triage, audit-log browsing, and system-settings overrides.
## Requirements
### Requirement: Admin route guard and audit coverage
The system SHALL protect every `/admin/*` route with `@Roles('admin')` so a caller whose role is not `admin` receives `403` (S1 `RolesGuard`). Every admin request SHALL be recorded by the S1 `AuditInterceptor` into `audit_logs` (actor, action, method, path), including the admin verification decisions and status changes.

#### Scenario: Non-admin blocked everywhere
- **WHEN** any authenticated non-admin account (volunteer or organization) calls any `/admin/*` route
- **THEN** the response is `403` and no resource is changed

#### Scenario: Admin action audited
- **WHEN** an admin calls an `/admin/*` route
- **THEN** an `audit_logs` document is written for that action with the admin as actor

#### Scenario: Guest blocked from admin
- **WHEN** an unauthenticated request reaches an `/admin/*` route
- **THEN** the response is `401` (authentication required before the role check)

### Requirement: Admin stats overview
The system SHALL expose `GET /admin/stats/overview` (admin) returning a moderation summary: `counts` (total `users`, `volunteers` (role), `organizations`, `verifiedOrganizations`, `opportunities`, and open `pendingVerifications` rows), `totalVolunteerHours` (sum of `volunteer_profiles.stats.volunteerHours` across all volunteers), `verificationRate` (verified organizations ÷ total organizations, `0` when there are no organizations), and `gateFreezes` (the number of distinct organizations currently locked by the §4 publish gate per read of `opportunities`/`submissions` state and `publishGate.maxPendingOpportunities` from `system_settings`).

#### Scenario: Overview with empty data
- **WHEN** an admin requests the overview for a database with a few accounts and no opportunities/submissions
- **THEN** the response contains counts, `totalVolunteerHours` (0), `verificationRate`, and `gateFreezes` (0) with consistent values

#### Scenario: Hours accumulate volunteer stats
- **WHEN** volunteers have accumulated `volunteerHours` in their profile stats
- **THEN** `totalVolunteerHours` equals their sum across volunteers

#### Scenario: Verification rate reflects decisions
- **WHEN** some organizations are verified and others are pending/rejected
- **THEN** `verificationRate` equals verified ÷ total and `verifiedOrganizations` is the number of `verified` organizations

#### Scenario: Gate freezes count locked organizations
- **WHEN** an organization's pending-review opportunities meet or exceed `publishGate.maxPendingOpportunities`
- **THEN** the organization is counted in `gateFreezes`

### Requirement: Admin user listing
The system SHALL expose `GET /admin/users` (admin) returning a cursor-paginated list (default 20, max 50) of `users` documents filtered by optional `role`, `status`, and `q` (case-insensitive substring match on `email`). The password hash SHALL NEVER be included. A `role` filter that is not a valid user role or a `status` filter that is not valid SHALL be rejected by DTO validation.

#### Scenario: List filtered by role and status
- **WHEN** an admin calls `GET /admin/users?role=volunteer&status=active`
- **THEN** only active volunteers are returned
- **THEN** no response item contains a password hash

#### Scenario: Search by email substring
- **WHEN** an admin calls `GET /admin/users?q=basm`
- **THEN** only users whose email contains `basm` (case-insensitive) are returned

#### Scenario: Cursor paginated
- **WHEN** an admin pages through `GET /admin/users`
- **THEN** each page follows the cursor convention (default limit 20, max 50) and covers the whole population

### Requirement: Admin user detail
The system SHALL expose `GET /admin/users/:userId` (admin) returning the requested user without the password hash, or `404` when no user exists (including invalid ObjectId handling as a `400`).

#### Scenario: Existing user returned
- **WHEN** an admin requests an existing user id
- **THEN** the user is returned with no password hash

#### Scenario: Unknown user 404
- **WHEN** an admin requests an id with no matching user
- **THEN** the response is `404`

### Requirement: Admin user status control
The system SHALL expose `PATCH /admin/users/:userId/status` (admin) accepting `{ status, reason?, notes? }` with value `active` or `suspended`. The change SHALL be recorded through `StatusTransitionService.assert` for entity type `user` with whitelist `active ↔ suspended` (writing a `status_histories` row). Optional `reason` (short, ≤500) and `notes` (≤2000) SHALL be persisted on the history row when provided; absent values SHALL leave those fields unset. A user already in the target status SHALL fail with `409 INVALID_STATUS_TRANSITION`, and a `deleted` user SHALL be unchangeable. Suspended users SHALL be rejected by the S1 `SuspendedGuard` on their next authenticated call.

#### Scenario: Suspend an active user
- **WHEN** an admin sets an active user to `suspended`
- **THEN** the user's `status` becomes `suspended` and a `status_histories` row records `active → suspended`

#### Scenario: Suspend with reason and notes
- **WHEN** an admin sets status with `{ status: 'suspended', reason: '...', notes: '...' }`
- **THEN** the history row carries the same `reason` and `notes`, readable via `GET /admin/status-histories`

#### Scenario: Reinstate a suspended user
- **WHEN** an admin sets a suspended user to `active`
- **THEN** the user's `status` becomes `active` and a `status_histories` row records `suspended → active`

#### Scenario: Suspended user blocked at the guard
- **WHEN** a suspended user subsequently calls any authenticated route
- **THEN** the guard rejects the request with `403` and a business code such as `ACCOUNT_SUSPENDED`

#### Scenario: No-op transition rejected
- **WHEN** an admin sets a user's status to its current value
- **THEN** the response is `409 INVALID_STATUS_TRANSITION` and no history row is written

#### Scenario: Deleted user cannot be changed
- **WHEN** an admin attempts to change a `deleted` user's status
- **THEN** the response is `409 INVALID_STATUS_TRANSITION`

#### Scenario: Invalid status value rejected
- **WHEN** an admin sends a status value other than `active` or `suspended`
- **THEN** the request is rejected by DTO validation

### Requirement: Admin volunteer listing
The system SHALL expose `GET /admin/volunteers` (admin) returning a cursor-paginated list of volunteer profiles joined with their linked `users` account (role `volunteer`), so moderators can inspect profile completion and account state without the password hash.

#### Scenario: Volunteers listed with profile and account
- **WHEN** an admin requests `GET /admin/volunteers`
- **THEN** each item includes the volunteer profile and its linked account (no password hash), cursor-paginated per the S1 convention

#### Scenario: Paging covers all volunteers
- **WHEN** an admin pages through `GET /admin/volunteers`
- **THEN** every volunteer with a profile appears exactly once across pages

### Requirement: Admin organization listing
The system SHALL expose `GET /admin/organizations` (admin) returning a cursor-paginated list of all organizations (regardless of `verificationStatus` or `status`) including file and verification state, so moderators can triage the queue.

#### Scenario: All organizations listed
- **WHEN** an admin requests `GET /admin/organizations`
- **THEN** every organization is returned (pending, rejected, verified, active, or suspended), cursor-paginated

### Requirement: Admin organization verifications listing
The system SHALL expose `GET /admin/organizations/verifications` (admin) returning a cursor-paginated list of `organization_verifications` rows filterable by `status` (default `pending`), each enriched with its organization summary (id, slug, name, current `verificationStatus`). This is the moderator's decision queue.

#### Scenario: Pending verifications listed
- **WHEN** an admin requests `GET /admin/organizations/verifications?status=pending`
- **THEN** all rows with `status=pending` are returned ordered by `submittedAt` (oldest first for FIFO triage), each with its organization summary

#### Scenario: Filter by another status
- **WHEN** an admin requests `GET /admin/organizations/verifications?status=rejected`
- **THEN** only `rejected` rows are returned

### Requirement: Admin approves organization verification
The system SHALL expose `POST /admin/organizations/:organizationId/verification/approve` (admin): the organization's latest pending `organization_verifications` row SHALL be set to `status=verified` with `decidedAt` and `decidedBy` (the admin's user id); the organization SHALL transition `verificationStatus` `pending → verified` through `StatusTransitionService.assert` (entity type `organization`); and `org.verification.updated` SHALL be emitted on the S1 EventEmitter bus with the organization's id so the S9 handler notifies the org account. This is the F1 path that makes the organization able to publish. An organization with no pending verification row SHALL fail `409`; an unverifiable organization (unknown id) SHALL return `404`; an already-`verified` organization SHALL fail `409`.

#### Scenario: Approve a pending organization
- **WHEN** an admin approves an organization with a pending verification row
- **THEN** the latest verification row becomes `verified` with `decidedAt`/`decidedBy` set
- **AND** the organization's `verificationStatus` becomes `verified` with a `status_histories` row `pending → verified`
- **AND** `org.verification.updated` is emitted exactly once (creating one org-account notification)

#### Scenario: Approved organization can publish
- **WHEN** a just-verified organization calls the S6 publish route
- **THEN** the publish is no longer blocked by verification (unblocks the F1 core loop)

#### Scenario: Approved org resubmission blocked
- **WHEN** an admin approves an organization whose `verificationStatus` is already `verified`
- **THEN** the response is `409`

#### Scenario: No pending row to decide
- **WHEN** an admin approves an organization with no `pending` verification row
- **THEN** the response is `409` with a business code such as `NO_PENDING_VERIFICATION`

#### Scenario: Unknown organization 404
- **WHEN** an admin approves a nonexistent organization id
- **THEN** the response is `404`

### Requirement: Admin rejects organization verification
The system SHALL expose `POST /admin/organizations/:organizationId/verification/reject` (admin) with a required `{ rejectionReason }`: the latest pending verification row SHALL be set to `status=rejected` recording `rejectionReason`, `decidedAt`, and `decidedBy`; the organization SHALL transition `verificationStatus` `pending → rejected` through `StatusTransitionService.assert`; and `org.verification.updated` SHALL be emitted so the org account is notified. The S5 resubmit route SHALL then allow the organization to return to `pending` with fresh documents. Missing `rejectionReason` SHALL fail with `400`; no pending row SHALL fail `409`; unknown org `404`.

#### Scenario: Reject a pending organization
- **WHEN** an admin rejects an organization with a pending verification row and a non-empty reason
- **THEN** the latest verification row becomes `rejected` with `rejectionReason`/`decidedAt`/`decidedBy`
- **AND** the organization's `verificationStatus` becomes `rejected` with a `status_histories` row `pending → rejected`
- **AND** `org.verification.updated` is emitted exactly once

#### Scenario: Rejection reason required
- **WHEN** an admin rejects with an empty or absent `rejectionReason`
- **THEN** the response is `400` and no state changes

#### Scenario: No pending row to decide
- **WHEN** an admin rejects an organization with no `pending` verification row
- **THEN** the response is `409`

#### Scenario: Rejected organization resubmits
- **WHEN** a rejected organization submits new documents through `POST /organizations/me/verification`
- **THEN** the organization returns to `pending` and a new verification row is created (existing S5 behavior)

### Requirement: Admin organization status control
The system SHALL expose `PATCH /admin/organizations/:organizationId/status` (admin) accepting `{ status, reason?, notes? }` with value `active` or `suspended`. The change SHALL be recorded through `StatusTransitionService.assert` for entity type `organization` with whitelist including `active ↔ suspended` (writing a `status_histories` row). Optional `reason` (≤500) and `notes` (≤2000) SHALL be persisted on the history row when provided. A suspended organization SHALL NOT be able to publish opportunities (enforced by the S6 publish route), and an already-`suspended` (or `deleted`) organization SHALL fail with `409 INVALID_STATUS_TRANSITION`.

#### Scenario: Suspend an active organization
- **WHEN** an admin sets an active organization to `suspended`
- **THEN** the organization's `status` becomes `suspended` and a `status_histories` row records `active → suspended`

#### Scenario: Suspend with reason and notes
- **WHEN** an admin sets status with `{ status: 'suspended', reason: '...', notes: '...' }`
- **THEN** the history row carries the same `reason` and `notes`, readable via `GET /admin/status-histories`

#### Scenario: Suspended org publish blocked
- **WHEN** a suspended organization attempts to publish an opportunity through the S6 route
- **THEN** the publish is rejected (regression of the existing publish-enforcement behavior)

#### Scenario: Reinstate a suspended organization
- **WHEN** an admin sets a suspended organization to `active`
- **THEN** the organization's `status` becomes `active` and a `status_histories` row records `suspended → active`

#### Scenario: No-op or deleted transition rejected
- **WHEN** an admin sets an organization's status to its current value or targets a `deleted` organization
- **THEN** the response is `409 INVALID_STATUS_TRANSITION`

#### Scenario: Invalid status value rejected
- **WHEN** an admin sends a status value other than `active` or `suspended`
- **THEN** the request is rejected by DTO validation

### Requirement: Admin opportunity listing
The system SHALL expose `GET /admin/opportunities` (admin) returning a cursor-paginated list of all opportunities, newest-first (`_id` descending), default `limit` 20 / max 50 per the S1 cursor convention. This is how moderators find an opportunity to force-close; all statuses are visible to the admin (not just `published`).

#### Scenario: Opportunities list newest-first
- **WHEN** an admin requests `GET /admin/opportunities`
- **THEN** every opportunity is returned cursor-paginated, ordered newest-first with `limit` normalized to 20/50

#### Scenario: Paged list covers all opportunities
- **WHEN** an admin pages through `GET /admin/opportunities`
- **THEN** every opportunity appears exactly once across pages

### Requirement: Admin opportunity status control
The system SHALL expose `PATCH /admin/opportunities/:opportunityId/status` (admin) accepting `{ status, reason?, notes? }` with value `closed` or `cancelled`. The change SHALL be validated through `StatusTransitionService.assert` for entity type `opportunity` (existing whitelist `published|in_progress → closed|cancelled`), writing a `status_histories` row. Optional `reason` (≤500) and `notes` (≤2000) SHALL be persisted on the history row when provided. An absent opportunity SHALL return `404`; a malformed ObjectId SHALL return `400` via the global CastError filter; a no-op or any unlisted transition (e.g. a draft opportunity) SHALL fail with `409 INVALID_STATUS_TRANSITION`.

#### Scenario: Force-close a live opportunity
- **WHEN** an admin sets an `in_progress` (or `published`) opportunity to `closed` (or `cancelled`)
- **THEN** the opportunity's `status` becomes the requested value and a `status_histories` row records the transition

#### Scenario: Force-close with reason and notes
- **WHEN** an admin sets status with `{ status: 'closed', reason: '...', notes: '...' }`
- **THEN** the history row carries the same `reason` and `notes`, readable via `GET /admin/status-histories`

#### Scenario: Unknown opportunity 404
- **WHEN** an admin targets an id with no matching opportunity
- **THEN** the response is `404` in the error envelope

#### Scenario: Illegal or no-op transition rejected
- **WHEN** an admin sets a draft opportunity's status, or requests a status equal to the current one
- **THEN** the response is `409 INVALID_STATUS_TRANSITION` and no history row is written

#### Scenario: Invalid status value rejected
- **WHEN** an admin sends a status other than `closed` or `cancelled`
- **THEN** the request is rejected by DTO validation

### Requirement: Admin review hiding
The system SHALL expose `PATCH /admin/reviews/:reviewId/hide` (admin) setting the review's `status` to `hidden`, so the review is excluded from organization reliability metrics and the platform-average anomaly comparison. An absent review SHALL return `404`; hiding an already-hidden review SHALL return `409`. Hiding is an additive moderation flag, not a `StatusTransitionService` lifecycle transition: no `status_histories` row is written (the admin action itself is already audited by the S1 interceptor).

#### Scenario: Hide an existing review
- **WHEN** an admin hides an existing visible review
- **THEN** the review's `status` becomes `hidden` and the updated review is returned

#### Scenario: Unknown review 404
- **WHEN** an admin targets a non-existent review id
- **THEN** the response is `404`

#### Scenario: Already-hidden review 409
- **WHEN** an admin hides a review whose `status` is already `hidden`
- **THEN** the response is `409` and no change is made

### Requirement: Admin report listing
The system SHALL expose `GET /admin/reports` (admin) returning a cursor-paginated list of `reports` rows, newest-first, optionally filtered by `status` (values `open | in_review | resolved | dismissed`). This is the moderator's triage queue.

#### Scenario: All reports listed newest-first
- **WHEN** an admin requests `GET /admin/reports`
- **THEN** every report row is returned cursor-paginated, newest-first

#### Scenario: Filtered by status
- **WHEN** an admin requests `GET /admin/reports?status=open`
- **THEN** only `open` reports are returned

#### Scenario: Invalid status filter rejected
- **WHEN** an admin passes a status outside the report enum
- **THEN** the request is rejected by DTO validation

### Requirement: Admin report resolution
The system SHALL expose `PATCH /admin/reports/:reportId` (admin) accepting `{ status, resolution? }` where `status` is one of `in_review | resolved | dismissed`. The change SHALL be validated through `StatusTransitionService.assert` for entity type `report` (whitelist `open → in_review | resolved | dismissed`, `in_review → resolved | dismissed`), writing a `status_histories` row. An absent report SHALL return `404`; a no-op or illegal transition SHALL return `409 INVALID_STATUS_TRANSITION`. An optional `resolution` note SHALL be stored on the row when provided.

#### Scenario: Move a report to resolved with a note
- **WHEN** an admin resolves an `open` or `in_review` report with `{ status: 'resolved', resolution: '...' }`
- **THEN** the report status becomes `resolved`, the `resolution` text is stored, and a `status_histories` row records the transition

#### Scenario: Move a report to in_review
- **WHEN** an admin sets an `open` report to `in_review`
- **THEN** the report status becomes `in_review` with a history row

#### Scenario: Unknown report 404
- **WHEN** an admin targets an id with no matching report
- **THEN** the response is `404`

#### Scenario: Illegal or no-op transition rejected
- **WHEN** an admin attempts `resolved → open`, `dismissed → in_review`, or a status equal to the current one
- **THEN** the response is `409 INVALID_STATUS_TRANSITION` and no history row is written

### Requirement: Admin audit-log browsing
The system SHALL expose `GET /admin/audit-logs` (admin) returning a read-only, cursor-paginated list of `audit_logs` rows filtered by the optional query parameters: `actor` (matches `actorId`), `entityType` and `entityId` (matches the `(entityType, entityId)` pair), and `date` (matches `createdAt` at or before the end of that day). Filters SHALL map to the existing indexes (no new indexes), and the list SHALL be newest-first. A malformed `actor`/`entityId`/`entityType` value that is not a valid ObjectId/marker SHALL be handled as `400` rather than `500`.

#### Scenario: Filter by actor
- **WHEN** an admin calls `GET /admin/audit-logs?actor=<userId>`
- **THEN** only audit rows for that actor are returned, newest-first

#### Scenario: Filter by entity
- **WHEN** an admin calls `GET /admin/audit-logs?entityType=organization&entityId=<id>`
- **THEN** only rows for that `(entityType, entityId)` pair are returned

#### Scenario: Filter by date
- **WHEN** an admin calls `GET /admin/audit-logs?date=2026-09-23`
- **THEN** only rows created on or before the end of that day are returned

#### Scenario: Read-only
- **WHEN** an admin browses audit logs
- **THEN** no `audit_logs` rows are created or mutated by the read itself

### Requirement: Admin settings listing
The system SHALL expose `GET /admin/settings` (admin) returning all `system_settings` rows (each with `key` and `value`). This makes the current publish-gate threshold and any future settings visible to moderators.

#### Scenario: All settings listed
- **WHEN** an admin requests `GET /admin/settings`
- **THEN** every `system_settings` row is returned with its `key` and `value`

#### Scenario: Empty settings returns empty list
- **WHEN** no settings exist yet
- **THEN** the response is an empty list, not an error

### Requirement: Admin settings write
The system SHALL expose `PUT /admin/settings/:key` (admin) accepting a JSON body `{ value }` and upserting the setting through the existing `SettingsService.set`, which refreshes the per-key cache so a subsequent read (including the S13 publish-gate threshold read) reflects the new value immediately. Only known keys SHALL be writable (the 16-key whitelist: `publishGate.maxPendingOpportunities`, `platform.*`, `locale.*`, `auth.adminSessionDurationDays`, `moderation.*`, `ops.*`, `maintenance.*`, `notifications.digest.*`); each key SHALL be validated against its declared type (numbers finite, booleans strict, strings bounded, language/format whitelisted). An unknown key SHALL return `400` with business code `UNKNOWN_SETTING_KEY`, and a `value` of the wrong shape (e.g. a non-number for a numeric threshold, a non-boolean for a kill-switch) SHALL return `400` with business code `INVALID_SETTING_VALUE`. The updated setting SHALL be returned, and the write SHALL be audited by the S1 interceptor.

#### Scenario: Upsert a known numeric threshold
- **WHEN** an admin calls `PUT /admin/settings/publishGate.maxPendingOpportunities` with `{ value: 1 }`
- **THEN** the setting is upserted, the cache reflects `1` immediately, and the updated setting is returned

#### Scenario: Unknown key rejected
- **WHEN** an admin writes a key outside the known set
- **THEN** the response is `400` and nothing is stored

#### Scenario: Wrong value shape rejected
- **WHEN** an admin sends a non-numeric value for the numeric publish-gate threshold
- **THEN** the request is rejected by validation and nothing is stored

#### Scenario: Wrong boolean shape rejected
- **WHEN** an admin sends a non-boolean value for `maintenance.enabled` or `ops.registrationEnabled`
- **THEN** the response is `400` (`INVALID_SETTING_VALUE`) and nothing is stored

### Requirement: Admin list CSV export
Every admin list endpoint SHALL accept `format=csv` (default JSON). With `format=csv` the endpoint SHALL stream the filtered result set as CSV directly to the HTTP response using `csv-stringify` (in-process streaming, never written to disk), with `Content-Type: text/csv` and a `Content-Disposition: attachment` filename naming the list and date. The CSV SHALL contain a header row and one row per matching document, applying the same `q`/filters/`sort` as the JSON variant. CSV SHALL respect the same `@Roles('admin')` guard; CSV output SHALL paginate with the same `limit` cap per chunk semantics as JSON (no unbounded full-collection dump beyond the existing max page window per request).

#### Scenario: CSV export mirrors filtered JSON
- **WHEN** an admin calls an admin list with the same filters plus `format=csv`
- **THEN** the response is `text/csv` with a header row and exactly the rows the JSON variant returns for that page window

#### Scenario: CSV escaping
- **WHEN** a field value contains commas, quotes, or newlines
- **THEN** the CSV output escapes it per RFC 4180 so the file parses to the same values

#### Scenario: Non-admin blocked from CSV
- **WHEN** a non-admin calls an admin list with `format=csv`
- **THEN** the response is `403` and no CSV is produced

#### Scenario: No disk artifact
- **WHEN** any admin CSV export runs
- **THEN** no file is created under the working directory or any storage path (streamed response only)

### Requirement: Admin volunteer list query power
`GET /admin/volunteers` SHALL accept `q` (case-insensitive match on username/name/email), `wilayaId`, `municipalityId`, `skillId` (multi-value comma-separated via the Session 7 `toArray` encoding), `from`/`to` (createdAt window), and whitelisted `sort`. Each row SHALL embed the volunteer's skill names and location labels (wilaya/municipality names resolved from reference data) plus the linked user's `lastActivityAt` and `emailVerifiedAt` state, joined in constant queries per page (never N+1). Unknown `sort` tokens SHALL fail `400`.

#### Scenario: Filtered volunteer search
- **WHEN** an admin calls `GET /admin/volunteers?q=...&wilayaId=...&skillId=a,b`
- **THEN** only matching volunteers are returned with `total`/`page`/`pages` reflecting the filtered set

#### Scenario: Labels embedded
- **WHEN** an admin lists volunteers
- **THEN** each row carries skill names, location names, `lastActivityAt`, and email-verified state without extra per-row queries

#### Scenario: Unknown sort rejected
- **WHEN** an admin passes a `sort` token outside the whitelist
- **THEN** the response is `400` and nothing is returned

### Requirement: Admin user list query power
`GET /admin/users` SHALL accept whitelisted `sort` in addition to the existing `role`/`status`/`q` filters. Unknown `sort` tokens SHALL fail `400`. Default ordering (newest-first) is unchanged.

#### Scenario: Sorted user list
- **WHEN** an admin calls `GET /admin/users?sort=<valid-token>`
- **THEN** rows return in that order with correct `total`/`page`/`pages`

### Requirement: Admin organization list query power
`GET /admin/organizations` SHALL accept `q` (name/slug/registryId match), `type`, `wilayaId`, `municipalityId`, `verificationStatus`, `status`, and whitelisted `sort`. Each row SHALL embed type and location labels where those fields exist on the row (`org-facts` owns the fact-sheet fields; this change only reads and filters on them). Unknown `sort` tokens SHALL fail `400`.

#### Scenario: Filtered organization search
- **WHEN** an admin calls `GET /admin/organizations?type=...&verificationStatus=pending&q=...`
- **THEN** only matching organizations are returned with filtered totals

### Requirement: Admin verification assignment and latest dossier
The system SHALL expose `PATCH /admin/organizations/verifications/:rowId/assign` (admin) accepting `{ assignedAdminId }`, setting `organization_verifications.assignedAdminId` to an existing `admin`-role user id. A nonexistent row SHALL return `404`; a nonexistent or non-admin assignee SHALL fail `400`; the assignment SHALL be audited by the admin interceptor. The system SHALL expose `GET /admin/organizations/:organizationId/verification/latest` (admin) returning the newest `organization_verifications` row for that organization (by `submittedAt`), or `404` when none exists. `GET /admin/organizations/verifications` SHALL accept an `assignedAdminId` filter and SHALL surface `assignedAdminId` per row.

#### Scenario: Assign a dossier to an admin
- **WHEN** an admin assigns a verification row to an existing admin user
- **THEN** the row's `assignedAdminId` is set and returned

#### Scenario: Assign to non-admin rejected
- **WHEN** the assignee id is missing or belongs to a non-admin role
- **THEN** the response is `400` (missing row is `404`) and nothing changes

#### Scenario: Latest dossier read
- **WHEN** an admin requests the latest verification for an organization with submissions
- **THEN** the newest row by `submittedAt` is returned with its `assignedAdminId`

### Requirement: Admin opportunity list enrichment
`GET /admin/opportunities` SHALL accept `q` (title/slug/registryId match), `status`, `organizationId`, and whitelisted `sort`. Each row SHALL include positions with per-position capacity and filled counts, aggregate application counts, location labels, and assigned volunteer names (public names only, per decision 5). Unknown `sort` tokens SHALL fail `400`.

#### Scenario: Enriched opportunity rows
- **WHEN** an admin lists opportunities
- **THEN** each row carries positions/capacity, application counts, location labels, and assigned volunteer names with correct filtered totals

### Requirement: Admin report list enrichment
`GET /admin/reports` SHALL accept `q`, `targetType`, `priority`, `assignedAdminId`, `from`/`to`, and whitelisted `sort` in addition to `status`. Each row SHALL embed a reporter summary (id, username/full name) and a target-entity summary (type, id, title/name). `PATCH /admin/reports/:reportId/assign` (admin) SHALL set `reports.assignedAdminId` with the same assignee validation as verification assignment. Unknown `sort` tokens SHALL fail `400`.

#### Scenario: Filtered report triage
- **WHEN** an admin calls `GET /admin/reports?targetType=user&priority=high`
- **THEN** only matching reports are returned with reporter and target summaries attached

#### Scenario: Report assignment
- **WHEN** an admin assigns a report to an existing admin user
- **THEN** the report's `assignedAdminId` is set and returned

### Requirement: Admin audit-log enrichment
`GET /admin/audit-logs` SHALL embed actor display names (username/full name + role) and target display names per row, joined in constant queries per page. Entity extraction SHALL include `reports` (report admin actions resolve to `entityType=reports`). `q` full-text over action/path SHALL be accepted alongside the existing `actor`/`entityType`/`entityId`/`date` filters, plus whitelisted `sort`.

#### Scenario: Names on audit rows
- **WHEN** an admin browses audit logs
- **THEN** each row carries actor and target display names

#### Scenario: Reports entity extraction
- **WHEN** an admin acts on a report route
- **THEN** the audit row resolves to `entityType=reports` with the report id

### Requirement: Admin status-histories read
The system SHALL expose `GET /admin/status-histories?entityType=&entityId=` (admin) returning the `status_histories` rows for that entity ordered oldest-first, including `from`, `to`, `actor`, `reason`, `notes`, and timestamps. Both query params are required (`400` when absent); a malformed `entityId` SHALL fail `400`. Reads SHALL be audited but SHALL NOT write history rows.

#### Scenario: History for a suspended user
- **WHEN** an admin reads histories for a user suspended with reason/notes
- **THEN** the rows include the `active → suspended` transition with the recorded `reason`/`notes` and actor

#### Scenario: Missing params rejected
- **WHEN** either `entityType` or `entityId` is absent
- **THEN** the response is `400`

### Requirement: Admin volunteer experiences read
The system SHALL expose `GET /admin/volunteers/:volunteerId/experiences` (admin) returning that volunteer's verified-experience rows through the `AdminExperienceDisplay` seam, now bound to the real `experience-enrichment` provider (RP §3.2#9 "Latest Verified Engagement"). The response SHALL be a single newest-first counted page of enriched rows (`id`, `registryId`, `title`, `description`, `skills`, real `duration`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, `verificationCode`, `publicVisibility`, neutral `review { rating, notes } | null`), covering experiences of any `publicVisibility`. Unknown volunteers SHALL return `404`; non-admin callers SHALL receive `403`. The admin module's route and service code are unchanged — only the seam's DI binding is swapped.

#### Scenario: Real provider returns enriched rows
- **WHEN** an admin requests experiences for a volunteer with verified experiences after `experience-enrichment` ships
- **THEN** the response is a valid counted page with the enriched rows newest-first (no 500, no invented rows)

#### Scenario: Volunteer without experiences returns empty page
- **WHEN** an admin requests experiences for a known volunteer with no experiences
- **THEN** the response is a valid counted page with zero items

#### Scenario: Unknown volunteer 404
- **WHEN** an admin requests experiences for a nonexistent volunteer id
- **THEN** the response is `404`

#### Scenario: Non-admin rejected
- **WHEN** a volunteer or organization account requests the admin experiences route
- **THEN** the response is `403`

### Requirement: Admin maintenance toggle
The system SHALL expose `POST /admin/ops/maintenance` (admin-only, audited by the S1 interceptor) accepting `{ enabled: boolean, message?: string }` (`whitelist` + `forbidNonWhitelisted` + transform). It SHALL write `maintenance.enabled` (and `maintenance.message` when provided) through `SettingsService.set` so the runtime gate and the Session 8 queue observe the change immediately, and SHALL return `{ enabled, message }`. Concurrent calls SHALL be single-flight (mirroring the `internal/jobs` mutex): overlapping toggles execute the write exactly once and all callers receive the same result.

#### Scenario: Maintenance switched on
- **WHEN** an admin posts `{ enabled: true, message: "Upgrading search" }`
- **THEN** `maintenance.enabled` is `true`, `maintenance.message` is stored, and the response is `{ enabled: true, message: "Upgrading search" }`

#### Scenario: Concurrent toggles collapse to one write
- **WHEN** two admins post conflicting toggles concurrently
- **THEN** the underlying setting write executes exactly once and both callers receive the same result

#### Scenario: Non-admin rejected
- **WHEN** a volunteer or organization user posts to `/admin/ops/maintenance`
- **THEN** the system returns 403 Forbidden and nothing is stored

#### Scenario: Invalid body rejected
- **WHEN** an admin posts a non-boolean `enabled` or an over-long `message`
- **THEN** the request fails `400` and nothing is stored

