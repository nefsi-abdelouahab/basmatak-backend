## MODIFIED Requirements

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

## ADDED Requirements

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
The system SHALL expose `GET /admin/volunteers/:volunteerId/experiences` (admin) returning that volunteer's verified-experience rows through the `AdminExperienceDisplay` seam. While the seam's inert default is bound, the route SHALL return the correct envelope with an empty item list; unknown volunteers SHALL return `404`.

#### Scenario: Inert seam returns envelope
- **WHEN** an admin requests experiences for a known volunteer before `experience-enrichment` ships
- **THEN** the response is a valid counted page with zero items (no 500, no invented rows)

#### Scenario: Unknown volunteer 404
- **WHEN** an admin requests experiences for a nonexistent volunteer id
- **THEN** the response is `404`
