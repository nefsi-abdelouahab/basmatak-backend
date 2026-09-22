## ADDED Requirements

### Requirement: task_participants collection

The system SHALL maintain a `task_participants` collection owned by the participations module, with `opportunityId`, `positionId` (the embedded position's `_id`), `applicationId` (unique — one participant per accepted application), `organizationId`, `volunteerId`, `status` (`accepted | active | completed | withdrawn | removed`, default `accepted`), an optional `reason` (set by organization removal), and timestamps. Indexes SHALL include unique `applicationId`, `(volunteerId, status)`, and `(opportunityId, positionId)` (per §3). A participant row is created only by the accept application transaction (S7) — never directly by routes — and its state machine is `accepted → active → completed` with `accepted | active → withdrawn | removed`, where `accepted → active` is performed by the S6 `opportunityStartTicker` job and `accepted → completed` by the S11 verify transaction.

#### Scenario: A participant is created only through acceptance

- **WHEN** the accept application transaction runs
- **THEN** exactly one `task_participants` row is created for that `applicationId` with status `accepted` (or `active` if the opportunity is already `in_progress`), and no other route creates participant rows

#### Scenario: Withdrawn or removed is terminal

- **WHEN** a participant's status is `withdrawn` or `removed`
- **THEN** no transition from that status is permitted by the state machine

### Requirement: Volunteer lists and views own participations

The system SHALL expose `GET /participations/me` (authenticated, `volunteer`, own rows only) returning the caller's "My Tasks", optionally filtered by `status`, with cursor pagination (default limit 20, max 50). It SHALL expose `GET /participations/:participationId` to either the owning volunteer or an organization account that owns the opportunity; any other caller SHALL receive 404 (non-owner treated as not-found). The list SHALL reflect rows already flipped to `withdrawn`/`removed` by the application-withdraw transaction (F2), the org remove route, and the S6 startDate job (so statuses flow through the machine, not a separate screen).

#### Scenario: Own tasks listed with status filter

- **WHEN** a volunteer requests `GET /participations/me?status=active`
- **THEN** only their own `active` participant rows are returned, paginated

#### Scenario: Foreign participation hidden

- **WHEN** a caller who is neither the owning volunteer nor the opportunity's org requests a participation
- **THEN** the request is treated as not-found (404)

### Requirement: Volunteer withdraws a participation

The system SHALL expose `POST /participations/:participationId/withdraw` (authenticated, volunteer owner). For a participant in `accepted` or `active`, the system SHALL transition it to `withdrawn` and decrement the owning position's `filledCount` by exactly 1, then emit `participation.withdrawn`. A `completed` participant SHALL NOT be withdrawable (409 `INVALID_PARTICIPATION_STATUS`). The decrement is performed on the embedded position of the opportunity document (array-filtered on `positions._id`).

#### Scenario: Withdraw frees a seat

- **WHEN** the owning volunteer withdraws an `active` participation
- **THEN** the participant becomes `withdrawn`, `filledCount` on its position is decremented by 1, and `participation.withdrawn` is emitted

#### Scenario: Completed task cannot be withdrawn

- **WHEN** the volunteer attempts to withdraw a `completed` participation
- **THEN** the request fails 409 `INVALID_PARTICIPATION_STATUS` and no counter changes

### Requirement: Organization removes a participant

The system SHALL expose `POST /participations/:participationId/remove` (authenticated, organization role, owning org) with body `{ reason }`. For a participant in `accepted` or `active`, the system SHALL transition it to `removed`, store the `reason`, and emit `participation.removed`. The seat is NOT freed by removal (decrement belongs to volunteer-driven withdraw only, per §2.10). A `completed` or already-`removed`/`withdrawn` participant SHALL fail with 409 `INVALID_PARTICIPATION_STATUS`.

#### Scenario: Org removes with reason

- **WHEN** the owning org removes an `accepted` participant providing a `reason`
- **THEN** the participant becomes `removed` with the reason stored, `filledCount` is unchanged, and `participation.removed` is emitted

#### Scenario: Removal of a terminal row is refused

- **WHEN** the org attempts to remove a `completed` participant
- **THEN** the request fails 409 `INVALID_PARTICIPATION_STATUS`

### Requirement: Organization lists participants of an opportunity

The system SHALL expose `GET /opportunities/:opportunityId/participants` (authenticated, organization role, owning org) returning the accepted volunteers (statuses `accepted` and `active`) for the opportunity's positions, with cursor pagination. Volunteer identity resolution may reuse the S4 public-profile seam; the requirement here is that a non-owning org or volunteer SHALL NOT see the list (404).

#### Scenario: Owning org sees accepted volunteers

- **WHEN** the owning org requests the participants of its opportunity
- **THEN** the participants in `accepted` or `active` are returned with their volunteer identity and position

#### Scenario: Foreign caller is refused

- **WHEN** a caller who does not own the opportunity requests its participants
- **THEN** the request is treated as not-found (404)