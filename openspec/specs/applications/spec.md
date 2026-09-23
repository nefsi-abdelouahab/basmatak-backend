# applications Specification

## Purpose
Applications: volunteer applications to specific positions, one active application per position, accept (transactional: creates a task participant and increments `filledCount`), reject with reason, and withdraw.
## Requirements
### Requirement: applications collection
The system SHALL maintain an `applications` collection owned by the applications module, with `opportunityId`, `positionId` (the embedded position's `_id` within the opportunity), `volunteerId`, `organizationId`, `status` (`pending | accepted | rejected | withdrawn`, default `pending`), an optional `message`, and timestamps. Indexes SHALL include a partial unique `(positionId, volunteerId)` restricted to `status in (pending, accepted)` (per §3, this is the dedupe key that prevents a second live application), plus `(opportunityId, status)` and `(volunteerId, status)`. A reference to the embedded position SHALL identify a position by its `_id` inside the opportunity document; the seat counters (`requiredCount`/`filledCount`) SHALL be read and mutated on the embedded position document itself, never duplicated in the application.

#### Scenario: A live duplicate is prevented by the partial index
- **WHEN** an application in `pending` or `accepted` already exists for a `(positionId, volunteerId)` pair
- **THEN** a Mongo `E11000` duplicate-key error on the partial unique index is surfaced to the caller as business error 409 with code `DUPLICATE_APPLICATION`, and no second row is created

#### Scenario: Historical applications do not block re-applying
- **WHEN** a prior application for the pair is in `rejected` or `withdrawn`
- **THEN** the partial unique index does not match (those statuses are excluded) and a fresh `pending` application can be created

### Requirement: Volunteer applies to a position
The system SHALL expose `POST /opportunities/:opportunityId/positions/:positionId/applications` (authenticated, `volunteer` role). Preconditions SHALL be enforced: the caller's email is verified when `EMAIL_VERIFICATION_REQUIRED=true` (A10, fail 403 `EMAIL_NOT_VERIFIED`); the opportunity must exist (else 404) and its status must be exactly `published` (otherwise 410 `APPLICATIONS_CLOSED` for `closed`/`cancelled`/`completed`); `applicationDeadline` if set must be today or in the future (else 410 `APPLICATION_DEADLINE_PASSED`); the target position must exist (404 `POSITION_NOT_FOUND`); the position must have an open seat (`filledCount < requiredCount`, else 409 `POSITION_FULL`). On success the system SHALL create a `pending` application, SHALL NOT consume a seat, and SHALL emit `application.created`.

#### Scenario: Successful apply
- **WHEN** a verified email-verified volunteer applies to an open position on a published opportunity with no prior live application
- **THEN** a `pending` application is created, the seat count is untouched, and `application.created` is emitted

#### Scenario: Email gate blocks apply
- **WHEN** `EMAIL_VERIFICATION_REQUIRED=true` and the volunteer's email is not verified
- **THEN** the request fails 403 with code `EMAIL_NOT_VERIFIED` and no application is created

#### Scenario: Deadline passed
- **WHEN** the opportunity's `applicationDeadline` is in the past
- **THEN** the request fails 410 with code `APPLICATION_DEADLINE_PASSED`

#### Scenario: Opportunity not accepting applications
- **WHEN** the opportunity status is not `published` (e.g. `closed`, `completed`)
- **THEN** the request fails 410 with code `APPLICATIONS_CLOSED`

#### Scenario: Seat full
- **WHEN** no position has `filledCount < requiredCount` for the requested position
- **THEN** the request fails 409 with code `POSITION_FULL`

### Requirement: Volunteer lists and views own applications
The system SHALL expose `GET /applications/me` (authenticated, `volunteer`, own rows only) returning the caller's applications, optionally filtered by `status`, with cursor pagination (default limit 20, max 50), ordered by recency. It SHALL expose `GET /applications/:applicationId` to either the owning volunteer or an organization account that owns the opportunity the application belongs to; any other caller SHALL receive 404 (non-owner treated as not-found, per §6 visibility rules).

#### Scenario: Own applications listed
- **WHEN** a volunteer requests `GET /applications/me?status=pending`
- **THEN** only their own `pending` applications are returned, paginated by the cursor convention

#### Scenario: Foreign application is not visible
- **WHEN** a volunteer requests an application that belongs to another volunteer and is not the owning organization
- **THEN** the request is treated as not-found (404)

### Requirement: Organization accepts an application (transaction)
The system SHALL expose `POST /applications/:applicationId/accept` (authenticated, organization role, owning org of the opportunity) implementing the accept transaction (inventory §5, F3). Inside the transaction it SHALL: re-read the opportunity and assert its status is `published` or `in_progress` (any other status — `closed`/`cancelled`/`completed` — aborts with 410 `APPLICATIONS_CLOSED`) and, when `applicationDeadline` is set, that it is today or in the future (abort if not); increment the target position's `filledCount` with an array-filtered `findOneAndUpdate` guarded by `filledCount < requiredCount` and abort with 409 `POSITION_FULL` when it matches no document (this makes the guard atomic and removes the TOCTOU window); set the application `pending → accepted`; insert a `task_participants` row with status `accepted`, or `active` when the opportunity is already `in_progress` (inventory §5); and persist the status history plus the in-app notification inside the same transaction (F4). Only after commit SHALL it emit `application.accepted`. If any step fails, the whole transaction SHALL roll back leaving no partial rows.

#### Scenario: Accept fills one seat exactly
- **WHEN** the owning org accepts a `pending` application for a position with seats available
- **THEN** the application becomes `accepted`, exactly one `task_participants` row is created (`accepted`), the position's `filledCount` is incremented by exactly 1, and `application.accepted` is emitted after commit

#### Scenario: Concurrent accepts cannot over-book the last seat
- **WHEN** two accepts race for the same last free seat on a position
- **THEN** exactly one succeeds and the other fails 409 `POSITION_FULL`, leaving `filledCount == requiredCount` with never more accepted applications than seats

#### Scenario: Opportunity changed state mid-flight
- **WHEN** the opportunity is re-read inside the transaction and its status moved out of `published`/`in_progress` (e.g. it was `closed` or `cancelled` concurrently)
- **THEN** the transaction aborts with no mutation and the request fails 410 `APPLICATIONS_CLOSED`

#### Scenario: Rollback on failure
- **WHEN** any step inside the accept transaction fails (e.g. participant insert)
- **THEN** the application stays `pending`, no participant exists, and `filledCount` is unchanged

#### Scenario: Accepted into an in_progress opportunity
- **WHEN** the opportunity is already `in_progress` at accept time
- **THEN** the created participant's status is `active` rather than `accepted`

### Requirement: Organization rejects an application
The system SHALL expose `POST /applications/:applicationId/reject` (authenticated, organization role, owning org) with body `{ reason }`. A `pending` application SHALL transition `pending → rejected`, the reason SHALL be stored, and `application.rejected` SHALL be emitted. Rejecting a non-`pending` application SHALL fail with 409 `INVALID_APPLICATION_STATUS`.

#### Scenario: Reject with reason
- **WHEN** the owning org rejects a `pending` application providing a `reason`
- **THEN** the application becomes `rejected` with the reason stored, and `application.rejected` is emitted

#### Scenario: Reject of an accepted application is refused
- **WHEN** the org attempts to reject an application whose status is already `accepted`
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS` and the application state is unchanged

### Requirement: Volunteer withdraws an application
The system SHALL expose `POST /applications/:applicationId/withdraw` (authenticated, volunteer owner). A `pending` application SHALL transition `pending → withdrawn` (plain single-document update, no transaction) and emit `application.withdrawn`. An `accepted` application SHALL transition `accepted → withdrawn` inside the withdraw-accepted transaction (F2): within the same transaction the matching `task_participants` row (via its unique `applicationId`) SHALL be conditionally updated `accepted|active → withdrawn` (idempotent), and the position's `filledCount` SHALL be decremented by 1; status history and the in-app notification SHALL be persisted in the same transaction, and `application.withdrawn` + `participation.withdrawn` emitted only after commit. Any failure rolls back so the application stays `accepted` with its participant and seat intact. An application that is already `withdrawn` or `rejected` SHALL fail the withdrawal (409 `INVALID_APPLICATION_STATUS`).

#### Scenario: Withdraw pending is plain and immediate
- **WHEN** the volunteer owner withdraws a `pending` application
- **THEN** the application becomes `withdrawn` and `application.withdrawn` is emitted

#### Scenario: Withdraw accepted frees the seat and participant atomically
- **WHEN** the volunteer owner withdraws an `accepted` application
- **THEN** the application becomes `withdrawn`, the matching participant becomes `withdrawn`, `filledCount` is decremented by 1, and both events are emitted after commit

#### Scenario: Withdraw rollback on failure
- **WHEN** any step of the withdraw-accepted transaction fails
- **THEN** the application remains `accepted`, the participant keeps its prior status, and `filledCount` is unchanged

#### Scenario: Double withdraw is refused
- **WHEN** the caller attempts to withdraw an application already `withdrawn`
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS`