## ADDED Requirements

### Requirement: Reports collection and module
The system SHALL provide a `reports` collection (inventory §2.19, §3, module 21) owned by a new `backend/src/reports/` module, with documents carrying `reporterId` (ObjectId of the submitting account), `targetType` (ObjectId-less label from the fixed set `opportunity | user | organization | review | submission`), `targetId` (ObjectId), `reason` (required, trimmed), `description` (optional), `status` (enum `open | in_review | resolved | dismissed`, default `open`), and optional `resolution`. Indexes SHALL include `(status, createdAt)` and `(targetType, targetId)`.

#### Scenario: Report structure stored
- **WHEN** a report is created
- **THEN** the `reports` document carries `reporterId`, `targetType`, `targetId`, `reason`, `status=open`, and timestamps, with the configured indexes available

#### Scenario: Reports module boots
- **WHEN** the application boots with this change
- **THEN** the `reports` Mongoose model is registered and the module registers the report status whitelist with the S1 `StatusTransitionService`

### Requirement: User submits a report
The system SHALL expose `POST /reports` (authenticated, any logged-in role) accepting `{ targetType, targetId, reason, description? }` validated by DTO whitelist + forbidNonWhitelisted (typed `targetType` set, Mongo ObjectId `targetId`, non-empty `reason` ≤2000, `description` ≤4000). The route SHALL store the caller's user id as `reporterId` and return the created row with `status=open`. Missing required fields or an unknown `targetType` SHALL fail with `400`; unauthenticated callers receive `401`.

#### Scenario: Any logged-in role reports
- **WHEN** a logged-in volunteer, organization, or admin calls `POST /reports` with a valid payload
- **THEN** a `reports` row is created with `reporterId` equal to the caller's user id and `status=open`

#### Scenario: Invalid payload rejected
- **WHEN** the payload has an unknown `targetType`, a malformed `targetId`, or an empty `reason`
- **THEN** the response is `400` and no report row is written

#### Scenario: Guest blocked
- **WHEN** an unauthenticated request calls `POST /reports`
- **THEN** the response is `401`

### Requirement: Report status transitions
The system SHALL register the report state machine with the S1 `StatusTransitionService` as `open → in_review | resolved | dismissed` and `in_review → resolved | dismissed`. Any transition not on this whitelist SHALL fail with `409 INVALID_STATUS_TRANSITION` and no `status_histories` row (no-op transitions included).

#### Scenario: Resolve path succeeds
- **WHEN** a report is `open` or `in_review`
- **THEN** the system accepts a transition to `resolved` (or `dismissed`), records a `status_histories` row, and stores the optional `resolution` text

#### Scenario: Illegal transition rejected
- **WHEN** a code path attempts `resolved → open`, `dismissed → in_review`, or a no-op `open → open`
- **THEN** `409 INVALID_STATUS_TRANSITION` is raised and no history row is written