## ADDED Requirements

### Requirement: Aggregate applications inbox with real under_review state
The system SHALL render the org's cross-opportunity applications inbox from `GET /api/v1/organizations/me/applications` (`?opportunityId=&status=&q=&page=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with name joins, tabs for every real status (`pending`, `under_review`, `accepted`, `rejected`, `withdrawn`), result-count banners from `total`, and a per-opportunity view from `GET /api/v1/opportunities/:opportunityId/applications`. "Verified (8)"-style invented tabs SHALL NOT render.

#### Scenario: Under-review tab filters by real state
- **WHEN** an org user selects the "Under review" tab
- **THEN** the system requests `GET /api/v1/organizations/me/applications?status=under_review` and renders the returned items with the count banner from `total`.

#### Scenario: Cross-opportunity inbox filters combine
- **WHEN** an org user sets opportunity, status, and search query together
- **THEN** the system sends them as combined `?opportunityId=&status=&q=` params and re-renders the list from the server response.

### Requirement: Application review actions with start-review, accept, reject-with-reason
The system SHALL move an application `pending → under_review` via `POST /api/v1/applications/:applicationId/start-review`, accept via `POST /api/v1/applications/:applicationId/accept`, and reject via `POST /api/v1/applications/:applicationId/reject` with a caller-supplied `{reason}` collected in a dialog that blocks submit while empty. The persisted cover `message` SHALL render on the detail.

#### Scenario: Pending to accept via start-review
- **WHEN** an org user starts review on a pending application and then accepts it
- **THEN** the system posts start-review (status `under_review` on re-read) followed by accept, and surfaces success feedback.

#### Scenario: Reject requires a reason
- **WHEN** an org user opens the reject dialog and submits with an empty reason
- **THEN** the system blocks the submit and keeps the dialog open; with a non-empty reason it posts `{reason}` and the detail re-reads as `rejected`.

### Requirement: Applicant context via public-profile read
The system SHALL render applicant skills/experiences on the application detail from `GET /api/v1/volunteers/:username` (opt-out default-on public blocks only; never private fields), with a neutral empty state when the applicant hides a block.

#### Scenario: Applicant skills render from public profile
- **WHEN** an org user opens an application detail
- **THEN** the applicant's public skills/experiences render where the applicant's opt-out flags allow, and hidden blocks render as neutral empty states.

### Requirement: No messaging UI on applications
The system SHALL NOT render any "Ask clarification", contact, or message-thread affordance on the applications inbox or detail (deleted per V2 §B#12).

#### Scenario: No messaging affordances in DOM
- **WHEN** the applications inbox or detail renders
- **THEN** no clarification/contact/message element exists in the DOM.
