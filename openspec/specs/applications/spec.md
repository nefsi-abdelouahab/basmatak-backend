# applications Specification

## Purpose
Applications: volunteer applications to specific positions, one active application per position, accept (transactional: creates a task participant and increments `filledCount`), reject with reason, and withdraw.
## Requirements
### Requirement: applications collection
The system SHALL maintain an `applications` collection owned by the applications module, with `opportunityId`, `positionId` (the embedded position's `_id` within the opportunity), `volunteerId`, `organizationId`, `status` (`pending | under_review | accepted | rejected | withdrawn`, default `pending`), an optional `message`, and timestamps. Indexes SHALL include a partial unique `(positionId, volunteerId)` restricted to `status in (pending, under_review, accepted)` (per §3, this is the dedupe key that prevents a second live application — an application moved into `under_review` remains live and still blocks a duplicate), plus `(opportunityId, status)`, `(volunteerId, status)`, and `(organizationId, status)` (the last backs the org aggregate inbox). A reference to the embedded position SHALL identify a position by its `_id` inside the opportunity document; the seat counters (`requiredCount`/`filledCount`) SHALL be read and mutated on the embedded position document itself, never duplicated in the application.

#### Scenario: A live duplicate is prevented by the partial index
- **WHEN** an application in `pending`, `under_review`, or `accepted` already exists for a `(positionId, volunteerId)` pair
- **THEN** a Mongo `E11000` duplicate-key error on the partial unique index is surfaced to the caller as business error 409 with code `DUPLICATE_APPLICATION`, and no second row is created

#### Scenario: Historical applications do not block re-applying
- **WHEN** a prior application for the pair is in `rejected` or `withdrawn`
- **THEN** the partial unique index does not match (those statuses are excluded) and a fresh `pending` application can be created

#### Scenario: Inbox queries are index-backed
- **WHEN** the org aggregate inbox filters applications by `organizationId` and `status` (optionally `opportunityId`)
- **THEN** the `(organizationId, status)` and `(opportunityId, status)` indexes serve the query

### Requirement: Volunteer applies to a position
The system SHALL expose `POST /opportunities/:opportunityId/positions/:positionId/applications` (authenticated, `volunteer` role) with an optional `message` body field (trimmed, ≤ 2000 characters). Preconditions SHALL be enforced: the caller's email is verified when `EMAIL_VERIFICATION_REQUIRED=true` (A10, fail 403 `EMAIL_NOT_VERIFIED`); the opportunity must exist (else 404) and its status must be exactly `published` (otherwise 410 `APPLICATIONS_CLOSED` for `closed`/`cancelled`/`completed`); `applicationDeadline` if set must be today or in the future (else 410 `APPLICATION_DEADLINE_PASSED`); the target position must exist (404 `POSITION_NOT_FOUND`); the position must have an open seat (`filledCount < requiredCount`, else 409 `POSITION_FULL`). On success the system SHALL create a `pending` application storing the supplied `message` (absent messages stored as empty/undefined), SHALL NOT consume a seat, and SHALL emit `application.created`. The stored `message` SHALL be immutable for the application's lifetime — the system SHALL provide no route to edit it after apply — and SHALL be returned in own-volunteer and org application read payloads.

#### Scenario: Successful apply with a cover message
- **WHEN** a verified email-verified volunteer applies to an open position on a published opportunity with no prior live application and supplies a `message`
- **THEN** a `pending` application is created carrying the message, the seat count is untouched, and `application.created` is emitted

#### Scenario: Apply without a message
- **WHEN** a volunteer applies without a `message` body field
- **THEN** a message-less `pending` application is created (the message is optional)

#### Scenario: Oversized message rejected
- **WHEN** the supplied `message` exceeds 2000 characters
- **THEN** the request fails 400 `VALIDATION_ERROR` and no application is created

#### Scenario: Message is immutable after apply
- **WHEN** a caller attempts to change the message after the application exists
- **THEN** no route accepts the change and the stored message is unchanged

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
The system SHALL expose `GET /applications/me` (authenticated, `volunteer`, own rows only) returning the caller's applications, optionally filtered by `status`, `from`, and `to`, with cursor pagination (default limit 20, max 50) and counted cursor-page metadata. The date range SHALL apply to the application list’s creation timestamps. It SHALL expose `GET /applications/:applicationId` to either the owning volunteer or an organization account that owns the opportunity the application belongs to; any other caller SHALL receive 404 (non-owner treated as not-found, per §6 visibility rules).

#### Scenario: Own applications listed
- **WHEN** a volunteer requests `GET /applications/me?status=pending`
- **THEN** only their own `pending` applications are returned, paginated by the cursor convention

#### Scenario: Date range narrows own applications
- **WHEN** a volunteer supplies `from` and/or `to`
- **THEN** only their applications within the requested creation-date range are returned and the total reflects that filter

#### Scenario: Foreign application is not visible
- **WHEN** a volunteer requests an application that belongs to another volunteer and is not the owning organization
- **THEN** the request is treated as not-found (404)

### Requirement: Organization accepts an application (transaction)
The system SHALL expose `POST /applications/:applicationId/accept` (authenticated, organization role, owning org of the opportunity) implementing the accept transaction (inventory §5, F3). Inside the transaction it SHALL: re-read the opportunity and assert its status is `published` or `in_progress` (any other status — `closed`/`cancelled`/`completed` — aborts with 410 `APPLICATIONS_CLOSED`) and, when `applicationDeadline` is set, that it is today or in the future (abort if not); increment the target position's `filledCount` with an array-filtered `findOneAndUpdate` guarded by `filledCount < requiredCount` and abort with 409 `POSITION_FULL` when it matches no document (this makes the guard atomic and removes the TOCTOU window); set the application `pending | under_review → accepted` — the guarded update SHALL be scoped to the application's current status (`pending` or `under_review`) and the status history SHALL assert the matching source state, aborting with 409 `INVALID_APPLICATION_STATUS` when the application is no longer in that state (e.g. a concurrent start-review or decision moved it); insert a `task_participants` row with status `accepted`, or `active` when the opportunity is already `in_progress` (inventory §5); and persist the status history plus the in-app notification inside the same transaction (F4). Only after commit SHALL it emit `application.accepted`. If any step fails, the whole transaction SHALL roll back leaving no partial rows. The transaction's shape is unchanged from the v1 accept — only the allowed source status widens.

#### Scenario: Accept fills one seat exactly
- **WHEN** the owning org accepts a `pending` application for a position with seats available
- **THEN** the application becomes `accepted`, exactly one `task_participants` row is created (`accepted`), the position's `filledCount` is incremented by exactly 1, and `application.accepted` is emitted after commit

#### Scenario: Accept from under review
- **WHEN** the owning org accepts an `under_review` application for a position with seats available
- **THEN** the application becomes `accepted` via `under_review → accepted`, the participant and seat rules match the pending path, and a single `under_review → accepted` history row is written

#### Scenario: Concurrent accepts cannot over-book the last seat
- **WHEN** two accepts race for the same last free seat on a position
- **THEN** exactly one succeeds and the other fails 409 `POSITION_FULL`, leaving `filledCount == requiredCount` with never more accepted applications than seats

#### Scenario: Opportunity changed state mid-flight
- **WHEN** the opportunity is re-read inside the transaction and its status moved out of `published`/`in_progress` (e.g. it was `closed` or `cancelled` concurrently)
- **THEN** the transaction aborts with no mutation and the request fails 410 `APPLICATIONS_CLOSED`

#### Scenario: Rollback on failure
- **WHEN** any step inside the accept transaction fails (e.g. participant insert)
- **THEN** the application stays in its prior state (`pending` or `under_review`), no participant exists, and `filledCount` is unchanged

#### Scenario: Accepted into an in_progress opportunity
- **WHEN** the opportunity is already `in_progress` at accept time
- **THEN** the created participant's status is `active` rather than `accepted`

### Requirement: Organization rejects an application
The system SHALL expose `POST /applications/:applicationId/reject` (authenticated, organization role, owning org) with body `{ reason }`. A `pending` or `under_review` application SHALL transition to `rejected`, the reason SHALL be stored, and `application.rejected` SHALL be emitted. The guarded update SHALL be scoped to the application's current status and the status history SHALL assert the matching source state (`pending → rejected` or `under_review → rejected`). Rejecting an application in any other status (`accepted`, `withdrawn`, already `rejected`) SHALL fail with 409 `INVALID_APPLICATION_STATUS`.

#### Scenario: Reject with reason
- **WHEN** the owning org rejects a `pending` application providing a `reason`
- **THEN** the application becomes `rejected` with the reason stored, and `application.rejected` is emitted

#### Scenario: Reject from under review
- **WHEN** the owning org rejects an `under_review` application providing a `reason`
- **THEN** the application becomes `rejected` via `under_review → rejected` with the reason stored, and `application.rejected` is emitted

#### Scenario: Reject of an accepted application is refused
- **WHEN** the org attempts to reject an application whose status is already `accepted`
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS` and the application state is unchanged

### Requirement: Volunteer withdraws an application
The system SHALL expose `POST /applications/:applicationId/withdraw` (authenticated, volunteer owner). A `pending` or `under_review` application SHALL transition to `withdrawn` (plain single-document update, no transaction) and emit `application.withdrawn`. An `accepted` application SHALL transition `accepted → withdrawn` inside the withdraw-accepted transaction (F2): within the same transaction the matching `task_participants` row (via its unique `applicationId`) SHALL be conditionally updated `accepted|active → withdrawn` (idempotent), and the position's `filledCount` SHALL be decremented by 1; status history and the in-app notification SHALL be persisted in the same transaction, and `application.withdrawn` + `participation.withdrawn` emitted only after commit. Any failure rolls back so the application stays `accepted` with its participant and seat intact. An application that is already `withdrawn` or `rejected` SHALL fail the withdrawal (409 `INVALID_APPLICATION_STATUS`).

#### Scenario: Withdraw pending is plain and immediate
- **WHEN** the volunteer owner withdraws a `pending` application
- **THEN** the application becomes `withdrawn` and `application.withdrawn` is emitted

#### Scenario: Withdraw from under review is plain and immediate
- **WHEN** the volunteer owner withdraws an `under_review` application
- **THEN** the application becomes `withdrawn` via `under_review → withdrawn` and `application.withdrawn` is emitted

#### Scenario: Withdraw accepted frees the seat and participant atomically
- **WHEN** the volunteer owner withdraws an `accepted` application
- **THEN** the application becomes `withdrawn`, the matching participant becomes `withdrawn`, `filledCount` is decremented by 1, and both events are emitted after commit

#### Scenario: Withdraw rollback on failure
- **WHEN** any step of the withdraw-accepted transaction fails
- **THEN** the application remains `accepted`, the participant keeps its prior status, and `filledCount` is unchanged

#### Scenario: Double withdraw is refused
- **WHEN** the caller attempts to withdraw an application already `withdrawn`
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS`

### Requirement: Organization starts a review
The system SHALL expose `POST /applications/:applicationId/start-review` (authenticated, organization role, owning org of the opportunity) performing the `pending → under_review` transition through `StatusTransitionService.assert`. The caller SHALL be the organization that owns the application's opportunity; any other org or a volunteer SHALL receive 404 (non-owner treated as not-found). An application not currently `pending` SHALL fail with 409 `INVALID_APPLICATION_STATUS` (e.g. already `under_review`, `accepted`, `rejected`, or `withdrawn`) and SHALL NOT write a history row. A successful call SHALL write a `pending → under_review` history row and make accept/reject/withdraw valid from the application's new state.

#### Scenario: Pending moves to under review
- **WHEN** the owning org calls start-review on a `pending` application
- **THEN** the status becomes `under_review` and a `pending → under_review` status history row is written

#### Scenario: Repeated start-review is refused
- **WHEN** the owning org calls start-review on an application already `under_review`
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS` and no second history row is written

#### Scenario: Non-owning org cannot start review
- **WHEN** an org that does not own the opportunity, or a volunteer, calls start-review
- **THEN** the response is 404

#### Scenario: Wrong status cannot start review
- **WHEN** the owning org calls start-review on an `accepted`, `rejected`, or `withdrawn` application
- **THEN** the request fails 409 `INVALID_APPLICATION_STATUS` and no history row is written

### Requirement: Organization aggregate application inbox
The system SHALL expose `GET /organizations/me/applications` (authenticated, organization role) returning the applications of the caller's own opportunities across all opportunities — the aggregate inbox for the org dashboard's "Recent applications" (RP §2.1#6). The query SHALL be scoped by the organization resolved from the JWT account (`organizations.userId → organizations._id`), so a non-owning org never observes another org's applications. Filters SHALL include `?status=` (validated against the application statuses), `?opportunityId=` (a single opportunity), and `?q=` (text search over the org's own opportunity and position titles; caller-name search is deferred to the Session 17 name join). A validated `sort` parameter from the inbox’s server-defined whitelist SHALL be supported. Rows SHALL be returned with cursor pagination (default limit 20, max 50), counted cursor-page metadata, and plain projections (the document's own fields — ids, status, `message`, `reason`, timestamps); name/entity embeds SHALL be provided by the `ApplicationInboxJoiner` seam. A volunteer caller SHALL receive 403.

#### Scenario: Inbox aggregates across opportunities
- **WHEN** an organization requests `GET /organizations/me/applications`
- **THEN** applications across all of its opportunities are returned with counted cursor pagination and plain, name-free rows

#### Scenario: Inbox filtered by status and opportunity
- **WHEN** the org requests `?status=under_review&opportunityId=...`
- **THEN** only matching rows of its own opportunities are returned

#### Scenario: Text search narrows to matching opportunities
- **WHEN** the org requests `?q=cleanup`
- **THEN** only applications whose opportunity or position title matches are returned (matched against the org's own opportunities)

#### Scenario: Sort values are validated
- **WHEN** the org requests an unlisted inbox `sort` value
- **THEN** validation rejects the request

#### Scenario: Foreign org applications never leak
- **WHEN** two organizations each have applications and one lists the inbox
- **THEN** the other organization's rows are absent regardless of pagination depth

#### Scenario: Volunteer cannot use the inbox
- **WHEN** a volunteer calls `GET /organizations/me/applications`
- **THEN** the response is 403

### Requirement: ApplicationInboxJoiner seam
The system SHALL provide an `ApplicationInboxJoiner` extension seam (per the extension-seam convention) defined in `src/common/seams/`: an interface plus an inert default implementation that passes the aggregate-inbox application rows through unchanged. The aggregate inbox SHALL route its result rows through the joiner before returning them. Session 17 (`org-embed-labels`) SHALL swap in the real implementation — joining volunteer, organization, opportunity, and position display names onto the rows — via Nest DI without changing the applications module's code. While the inert default is bound, inbox rows SHALL contain only the application document's own plain fields and SHALL be name-free.

#### Scenario: Inert default passes rows through
- **WHEN** the org aggregate inbox returns rows while the inert default is bound
- **THEN** the rows are the plain application documents, unchanged by the joiner

#### Scenario: Real joiner fills names without module changes
- **WHEN** Session 17 binds the real `ApplicationInboxJoiner` provider
- **THEN** the same inbox route returns rows enriched with volunteer/org/opportunity/position names, and the applications module's code is unchanged

