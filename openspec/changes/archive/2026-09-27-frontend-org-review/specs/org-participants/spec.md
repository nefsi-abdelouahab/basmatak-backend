## ADDED Requirements

### Requirement: Aggregate participants roster including completed
The system SHALL render the org's aggregate participants roster from `GET /api/v1/organizations/me/participants` (`?q=&opportunityId=&status=&page=`, `CursorPage` totals) including `completed` rows, plus a per-opportunity view from `GET /api/v1/opportunities/:opportunityId/participants`. Roster labels SHALL align to the real participant/submission statuses; invented labels SHALL NOT render.

#### Scenario: Completed participants render
- **WHEN** the roster loads with participants in `completed` status
- **THEN** completed rows render alongside active ones with the correct real-status label and the count banner from `total`.

#### Scenario: Roster filters combine
- **WHEN** an org user sets search, opportunity, and status together
- **THEN** the system sends them as combined `?q=&opportunityId=&status=` params and re-renders from the server response.

### Requirement: Submission-state join on roster rows
The system SHALL render each roster row's joined submission state/files (from the aggregate payload's submission join) so the org sees review progress per participant without navigating away.

#### Scenario: Submission join renders per row
- **WHEN** a roster row carries a joined submission state
- **THEN** the row displays that submission state (and file presence where joined), mapped to the real submission vocabulary.

### Requirement: Participant remove with required reason
The system SHALL remove a participant via `POST /api/v1/participations/:participationId/remove` with a caller-supplied `{reason}` collected in a dialog that blocks submit while empty, followed by a roster re-read.

#### Scenario: Remove requires a reason
- **WHEN** an org user opens the remove dialog and submits with an empty reason
- **THEN** the system blocks the submit; with a non-empty reason it posts `{reason}` and the roster re-reads without the removed row.

### Requirement: No messaging UI on roster
The system SHALL NOT render any "Send participant message", contact, or message-thread affordance on the roster (deleted per V2 §B#13).

#### Scenario: No messaging affordances in DOM
- **WHEN** the participants roster renders
- **THEN** no message/contact element exists in the DOM.
