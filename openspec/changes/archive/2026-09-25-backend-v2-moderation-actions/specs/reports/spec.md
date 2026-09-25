## MODIFIED Requirements

### Requirement: Report status transitions
The system SHALL register the report state machine with the S1 `StatusTransitionService` as `open → in_review | resolved | dismissed` and `in_review → resolved | dismissed`. Any transition not on this whitelist SHALL fail with `409 INVALID_STATUS_TRANSITION` and no `status_histories` row (no-op transitions included). A transition to the terminal `resolved` status MAY carry a moderation action (moderation-actions capability): the action executes atomically with the transition in one Mongo transaction, and the report `resolution` text (required when an action is present) SHALL serve as the reason recorded on every consequence `status_histories` row.

#### Scenario: Resolve path succeeds
- **WHEN** a report is `open` or `in_review`
- **THEN** the system accepts a transition to `resolved` (or `dismissed`), records a `status_histories` row, and stores the optional `resolution` text

#### Scenario: Illegal transition rejected
- **WHEN** a code path attempts `resolved → open`, `dismissed → in_review`, or a no-op `open → open`
- **THEN** `409 INVALID_STATUS_TRANSITION` is raised and no history row is written

#### Scenario: Terminal resolution with action is atomic
- **WHEN** a report transitions to `resolved` with a moderation action whose consequence fails (e.g. an incompatible target status)
- **THEN** the transaction aborts and the report keeps its pre-transition status with no history rows written
