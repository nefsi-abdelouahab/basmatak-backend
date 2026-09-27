# admin-volunteers Specification

## Purpose
TBD - created by archiving change frontend-admin-manage. Update Purpose after archive.
## Requirements
### Requirement: Admin volunteer list with real query power and label embeds
The system SHALL render the admin volunteer table from `GET /api/v1/admin/volunteers` (`?q=&wilayaId=&municipalityId=&skillId=&from=&to=&sort=&page=&pageSize=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with each row carrying skill names, location (wilaya/municipality) labels, linked-account `lastActivityAt`, and email-verified state. Result-count banners SHALL read from `total`. `pageSize` SHALL stay within the backend window (default 20, max 50 — never 100).

#### Scenario: Filtered volunteer search re-queries
- **WHEN** an admin sets search text, location filters, skill filter, or created-at window
- **THEN** the system sends them as combined `?q=&wilayaId=&municipalityId=&skillId=&from=&to=` params and re-renders the list from the server response with the count banner from `total`.

#### Scenario: Unknown sort surfaces a validation error
- **WHEN** an admin requests an invalid `sort` token
- **THEN** the system surfaces the 400 validation error state instead of a list.

#### Scenario: No invented volunteer states
- **WHEN** the volunteer table renders
- **THEN** only the real account states (`active`, `suspended`, `deleted`) appear — no "Pending", "Incomplete", or badge beyond "Email verified".

### Requirement: Latest engagement via admin volunteer-experiences read
The system SHALL render a volunteer's latest engagement on the volunteer detail from `GET /api/v1/admin/volunteers/:volunteerId/experiences` (newest-first enriched rows with `EXP-<registryId>`, org identity, `verifiedAt`, neutral review), with a neutral empty state when the volunteer has no experiences.

#### Scenario: Latest engagement renders from enriched rows
- **WHEN** an admin opens a volunteer with verified experiences
- **THEN** the newest experience renders with its `EXP-<registryId>`, organization name, verification date, and neutral review.

#### Scenario: Volunteer without experiences shows empty state
- **WHEN** an admin opens a volunteer with no experiences
- **THEN** the system renders a neutral empty state (no invented placeholder engagement).

### Requirement: Volunteer account status control with reason and notes
The system SHALL suspend/reinstate a volunteer's linked user via `PATCH /api/v1/admin/users/:userId/status` accepting `{ status: 'active' | 'suspended', reason?, notes? }`, collecting optional `reason` (≤500) and `notes` (≤2000) in the dialog and persisting them to the history row. A no-op transition SHALL surface the 409 `INVALID_STATUS_TRANSITION` error; a `deleted` account SHALL NOT offer status actions.

#### Scenario: Suspend with reason and notes
- **WHEN** an admin suspends an active volunteer with a reason and notes
- **THEN** the system patches `{ status: 'suspended', reason, notes }` and the re-read account shows `suspended`.

#### Scenario: No-op transition rejected
- **WHEN** an admin requests the account's current status
- **THEN** the system surfaces the 409 error and writes no history row.

### Requirement: System notice to a volunteer
The system SHALL send a neutral system notice via `POST /api/v1/admin/users/:userId/notice` with a required non-empty `{ message }` (≤1000 chars) collected in a dialog that blocks submit while empty.

#### Scenario: Notice requires a message
- **WHEN** an admin opens the notice dialog and submits with an empty message
- **THEN** the system blocks the submit and keeps the dialog open; with a non-empty message it posts `{ message }` and surfaces success feedback.

### Requirement: Volunteer CSV export mirrors filtered JSON
The system SHALL export the filtered volunteer set via `GET /api/v1/admin/volunteers` with `format=csv` through the shared authed blob-download helper (`Content-Disposition: attachment`), applying the same `q`/filters/`sort` as the JSON view. The CSV SHALL download as a file (no navigation).

#### Scenario: CSV downloads with current filters
- **WHEN** an admin clicks Export CSV with filters applied
- **THEN** the system downloads a CSV attachment reflecting exactly those filters.

### Requirement: Status-history view for volunteer accounts
The system SHALL render a volunteer's account history from `GET /api/v1/admin/status-histories?entityType=user&entityId=<userId>` (oldest-first rows with `from`, `to`, actor, `reason`, `notes`, timestamps) after a suspend/reinstate so the recorded reason and notes are visible.

#### Scenario: Suspend reason visible in history
- **WHEN** an admin suspends a volunteer with a reason and opens the history
- **THEN** the `active → suspended` row renders with the recorded `reason`/`notes` and actor.

