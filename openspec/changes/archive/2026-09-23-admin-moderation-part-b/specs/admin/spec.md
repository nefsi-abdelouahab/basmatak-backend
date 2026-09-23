## ADDED Requirements

### Requirement: Admin opportunity listing
The system SHALL expose `GET /admin/opportunities` (admin) returning a cursor-paginated list of all opportunities, newest-first (`_id` descending), default `limit` 20 / max 50 per the S1 cursor convention. This is how moderators find an opportunity to force-close; all statuses are visible to the admin (not just `published`).

#### Scenario: Opportunities list newest-first
- **WHEN** an admin requests `GET /admin/opportunities`
- **THEN** every opportunity is returned cursor-paginated, ordered newest-first with `limit` normalized to 20/50

#### Scenario: Paged list covers all opportunities
- **WHEN** an admin pages through `GET /admin/opportunities`
- **THEN** every opportunity appears exactly once across pages

### Requirement: Admin opportunity status control
The system SHALL expose `PATCH /admin/opportunities/:opportunityId/status` (admin) accepting `{ status }` with value `closed` or `cancelled`. The change SHALL be validated through `StatusTransitionService.assert` for entity type `opportunity` (existing whitelist `published|in_progress → closed|cancelled`), writing a `status_histories` row. An absent opportunity SHALL return `404`; a malformed ObjectId SHALL return `400` via the global CastError filter; a no-op or any unlisted transition (e.g. a draft opportunity) SHALL fail with `409 INVALID_STATUS_TRANSITION`.

#### Scenario: Force-close a live opportunity
- **WHEN** an admin sets an `in_progress` (or `published`) opportunity to `closed` (or `cancelled`)
- **THEN** the opportunity's `status` becomes the requested value and a `status_histories` row records the transition

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
The system SHALL expose `PUT /admin/settings/:key` (admin) accepting a JSON body `{ value }` and upserting the setting through the existing `SettingsService.set`, which refreshes the per-key cache so a subsequent read (including the S13 publish-gate threshold read) reflects the new value immediately. Only known keys SHALL be writable (`publishGate.maxPendingOpportunities`); an unknown key SHALL return `400` with a business code such as `UNKNOWN_SETTING_KEY`, and a `value` of the wrong shape (e.g. a non-number for a numeric threshold) SHALL be rejected by validation. The updated setting SHALL be returned, and the write SHALL be audited by the S1 interceptor.

#### Scenario: Upsert a known numeric threshold
- **WHEN** an admin calls `PUT /admin/settings/publishGate.maxPendingOpportunities` with `{ value: 1 }`
- **THEN** the setting is upserted, the cache reflects `1` immediately, and the updated setting is returned

#### Scenario: Unknown key rejected
- **WHEN** an admin writes a key outside the known set
- **THEN** the response is `400` and nothing is stored

#### Scenario: Wrong value shape rejected
- **WHEN** an admin sends a non-numeric value for the numeric publish-gate threshold
- **THEN** the request is rejected by validation and nothing is stored