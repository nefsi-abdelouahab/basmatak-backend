## ADDED Requirements

### Requirement: Admin Analytics Overview
The system SHALL provide `GET /admin/analytics/overview` (the Session 8 analytics route, not the v1 `GET /admin/stats/overview`) with database-derived totals and deltas versus the previous period, the 30-day active-participants metric, and per-status counts for users, organizations, opportunities, applications, and submissions. The overview SHALL also provide the verification-ready queue, gate-freeze count, and reliability `medianDecisionHours`. It MUST contain no hardcoded figures.

#### Scenario: Admin requests the overview
- **WHEN** an admin requests `GET /admin/analytics/overview`
- **THEN** the system returns the required overview metrics derived from database data

### Requirement: Previous-Period Deltas
Each overview total SHALL be returned as `{ current, previous, deltaPercent }` where `current` counts documents with `createdAt` in the last 30 days, `previous` counts documents with `createdAt` in days 31–60 back, and `deltaPercent` is `(current - previous) / previous * 100`, or `null` when `previous` is 0.

#### Scenario: Delta with a zero previous window
- **WHEN** an overview total has no documents in the days 31–60 window
- **THEN** the system returns the current count with `previous: 0` and `deltaPercent: null`

#### Scenario: Delta with both windows populated
- **WHEN** an overview total has documents in both the last-30-day and days-31–60 windows
- **THEN** the system returns both counts with `deltaPercent` equal to the percentage change

### Requirement: 30-Day Active Participants
The 30-day active-participants metric SHALL count distinct `volunteerId` values across three sources in the last 30 days: applications created or updated, `task_participant` status changes recorded in `status_histories` (`entityType: 'task_participant'`) by `createdAt`, and submissions created or updated.

#### Scenario: Active participants counted distinctly
- **WHEN** a volunteer has an application, a participant status change, and a submission in the last 30 days
- **THEN** the volunteer contributes exactly 1 to the active-participants count

#### Scenario: Stale activity excluded
- **WHEN** a volunteer's only activity is older than 30 days
- **THEN** the volunteer is excluded from the active-participants count

### Requirement: Verification-Ready Queue Figure
The overview verification-ready figure SHALL count submissions with status `submitted` or `under_review` (the publish-gate definition; no new status is introduced), globally or grouped by organization as the endpoint needs.

#### Scenario: Only actionable submissions counted
- **WHEN** submissions exist in `draft`, `submitted`, `under_review`, `approved`, and `rejected` states
- **THEN** the verification-ready figure counts only the `submitted` and `under_review` rows

### Requirement: Verification Median Decision Hours
Reliability `medianDecisionHours` SHALL cover verifications only: the median of (`verification.decidedAt` minus `submission.createdAt`) in hours over verifications decided in the last 90 days. If fewer than 5 verifications exist in that window, the system SHALL return `null`. FIELD MAPPING: `submissions` has no `submittedAt` field so `submission.createdAt` is the submit-time source; `verifications` rows are created terminal at decision time so `decidedAt` is the decision timestamp, consistent with the existing reliability convention (`decidedAt - submission.createdAt`).

#### Scenario: Median over sufficient verifications
- **WHEN** at least 5 verifications were decided in the last 90 days
- **THEN** the system returns the median decision time in hours

#### Scenario: Too few verifications
- **WHEN** fewer than 5 verifications were decided in the last 90 days
- **THEN** the system returns `null` instead of a misleading median

### Requirement: Activity Time Series
The system SHALL provide `GET /admin/analytics/series?days=` for the per-day time series of signups, applications, and verifications. The requested range MUST be bounded to 1 through 90 days, and dates MUST use UTC.

#### Scenario: Admin requests a bounded series
- **WHEN** an admin requests a series with a `days` value from 1 through 90
- **THEN** the system returns the requested UTC daily activity series for signups, applications, and verifications

### Requirement: Admin Attention Queue
The system SHALL provide `GET /admin/analytics/queue` with attention totals for pending verifications, open reports, `under_review` submissions, and suspended accounts, plus the maintenance-mode flag. The queue MUST use the same source of truth as the overview for shared dashboard information.

#### Scenario: Admin requests the attention queue
- **WHEN** an admin requests `GET /admin/analytics/queue`
- **THEN** the system returns the required attention totals and the maintenance-mode flag from database-backed system state

### Requirement: Admin Analytics Access Control
All analytics endpoints MUST be restricted to users with the `admin` role.

#### Scenario: Non-admin requests analytics
- **WHEN** a volunteer or organization user requests an analytics endpoint
- **THEN** the system returns 403 Forbidden
