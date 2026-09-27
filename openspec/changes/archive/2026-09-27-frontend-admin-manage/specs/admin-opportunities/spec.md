## ADDED Requirements

### Requirement: Admin opportunity list with enrichment
The system SHALL render the admin opportunity table from `GET /api/v1/admin/opportunities` (`?q=&status=&organizationId=&sort=&page=&pageSize=`, newest-first, `CursorPage { items, nextCursor, limit, total, page, pages }`) with each row carrying positions (per-position capacity and filled counts), aggregate application counts, location labels, and assigned volunteer names. Result-count banners SHALL read from `total`. `pageSize` SHALL stay within the backend window (default 20, max 50 — never 100).

#### Scenario: Filtered opportunity search re-queries
- **WHEN** an admin sets search text, status, or organization filters together
- **THEN** the system sends them as combined `?q=&status=&organizationId=` params and re-renders the list from the server response with the count banner from `total`.

#### Scenario: Enriched rows render capacity and counts
- **WHEN** the opportunity table renders
- **THEN** each row shows its positions with capacity, application counts, location labels, and assigned volunteer names from the server payload (no invented stats, no global topbar search).

### Requirement: Force-close via status-PATCH (no close endpoint)
The system SHALL force-close or cancel a live opportunity via `PATCH /api/v1/admin/opportunities/:opportunityId/status` accepting `{ status: 'closed' | 'cancelled', reason?, notes? }` (naming diff §A#16 — never a `POST .../close` route), collecting optional `reason` (≤500) and `notes` (≤2000) in the dialog. A draft opportunity or no-op transition SHALL surface the 409 `INVALID_STATUS_TRANSITION` error.

#### Scenario: Force-close a live opportunity
- **WHEN** an admin sets a published opportunity to `closed` with a reason
- **THEN** the system patches `{ status: 'closed', reason, notes }` and the re-read opportunity shows `closed`.

#### Scenario: Draft force-close rejected
- **WHEN** an admin attempts to force-close a draft opportunity
- **THEN** the system surfaces the 409 error and writes no history row.

### Requirement: Opportunity CSV export mirrors filtered JSON
The system SHALL export the filtered opportunity set via `GET /api/v1/admin/opportunities` with `format=csv` through the shared authed blob-download helper (`Content-Disposition: attachment`), applying the same `q`/filters/`sort` as the JSON view.

#### Scenario: CSV downloads with current filters
- **WHEN** an admin clicks Export CSV with filters applied
- **THEN** the system downloads a CSV attachment reflecting exactly those filters.

### Requirement: Status-history view for opportunities
The system SHALL render an opportunity's history from `GET /api/v1/admin/status-histories?entityType=opportunity&entityId=<opportunityId>` (oldest-first rows with `from`, `to`, actor, `reason`, `notes`, timestamps) after a force-close so the recorded reason and notes are visible.

#### Scenario: Force-close reason visible in history
- **WHEN** an admin force-closes an opportunity with a reason and opens the history
- **THEN** the transition row renders with the recorded `reason`/`notes` and actor.

### Requirement: Non-admin admin-surface guard
The system SHALL render a 403 forbidden state (never the tables) on every `admin/*` route when the session user is not an `admin` (volunteer/organization roles), and SHALL redirect guests to Login (decision 10). Authenticated non-admin API 403s SHALL map to the same 403 state via the F0 error shape.

#### Scenario: Non-admin sees 403
- **WHEN** a volunteer or organization user visits any `admin/*` route
- **THEN** the system renders the 403 state with no table, rows, or actions in the DOM.

#### Scenario: Guest redirects to login
- **WHEN** a guest visits any `admin/*` route
- **THEN** the system redirects to the Login route with a `next` return target.
