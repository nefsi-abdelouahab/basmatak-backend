# admin-organizations Specification

## Purpose
TBD - created by archiving change frontend-admin-manage. Update Purpose after archive.
## Requirements
### Requirement: Admin organization list with real query power
The system SHALL render the admin organization table from `GET /api/v1/admin/organizations` (`?q=&type=&wilayaId=&municipalityId=&verificationStatus=&status=&sort=&page=&pageSize=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with type/location labels where present on the row. Result-count banners SHALL read from `total`. `pageSize` SHALL stay within the backend window (default 20, max 50 — never 100).

#### Scenario: Filtered organization search re-queries
- **WHEN** an admin sets search text, type, location, verification-status, or status filters together
- **THEN** the system sends them as combined query params and re-renders the list from the server response with the count banner from `total`.

#### Scenario: No invented organization states
- **WHEN** the organization table renders
- **THEN** only the real vocabularies appear (`status`: `active`/`suspended`/`deleted`; `verificationStatus`: `pending`/`verified`/`rejected`) — no "Legal Review" or seal/civic copy.

### Requirement: Organization account status control with reason and notes
The system SHALL suspend/reinstate an organization via `PATCH /api/v1/admin/organizations/:organizationId/status` accepting `{ status: 'active' | 'suspended', reason?, notes? }`, collecting optional `reason` (≤500) and `notes` (≤2000) in the dialog. A no-op or `deleted`-target transition SHALL surface the 409 `INVALID_STATUS_TRANSITION` error.

#### Scenario: Suspend with reason and notes
- **WHEN** an admin suspends an active organization with a reason and notes
- **THEN** the system patches `{ status: 'suspended', reason, notes }` and the re-read organization shows `suspended`.

#### Scenario: No-op transition rejected
- **WHEN** an admin requests the organization's current status
- **THEN** the system surfaces the 409 error and writes no history row.

### Requirement: Organization CSV export mirrors filtered JSON
The system SHALL export the filtered organization set via `GET /api/v1/admin/organizations` with `format=csv` through the shared authed blob-download helper (`Content-Disposition: attachment`), applying the same `q`/filters/`sort` as the JSON view.

#### Scenario: CSV downloads with current filters
- **WHEN** an admin clicks Export CSV with filters applied
- **THEN** the system downloads a CSV attachment reflecting exactly those filters.

### Requirement: Status-history view for organizations
The system SHALL render an organization's history from `GET /api/v1/admin/status-histories?entityType=organization&entityId=<organizationId>` (oldest-first rows with `from`, `to`, actor, `reason`, `notes`, timestamps) after a suspend/reinstate so the recorded reason and notes are visible.

#### Scenario: Suspend reason visible in history
- **WHEN** an admin suspends an organization with a reason and opens the history
- **THEN** the `active → suspended` row renders with the recorded `reason`/`notes` and actor.

