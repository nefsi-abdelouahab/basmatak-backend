# volunteer-tasks Specification

## Purpose
TBD - created by archiving change frontend-volunteer-tasks. Update Purpose after archive.
## Requirements
### Requirement: Own participations list
The system SHALL render the volunteer's own participations ("My Tasks") from `GET /api/v1/participations/me` (`?status=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with tabs bound to the real participant statuses (`accepted`, `active`, `completed`, `withdrawn`, `removed`) and result-count banners from `total`. No category server filter exists — no category tabs SHALL be built.

#### Scenario: Status tab filters participations
- **WHEN** a volunteer selects a participation status tab
- **THEN** the system requests `GET /api/v1/participations/me?status=<tab>` and renders the returned items with the count banner from `total`.

### Requirement: Participation detail with joins
The system SHALL render participation detail from `GET /api/v1/participations/:participationId` showing joined org/task/schedule/location names plus position deliverables. The system SHALL link onward to Submit Contribution (`volunteer/tasks/[participationId]/submit`, F7-owned) without implementing any submission editing here.

#### Scenario: Detail renders joined context
- **WHEN** a volunteer opens a participation detail
- **THEN** org/task/schedule/location names and position deliverables are displayed with a link to the F7 submit route.

### Requirement: Participation withdraw flow
The system SHALL withdraw via `POST /api/v1/participations/:participationId/withdraw` (valid from `accepted`/`active`; frees the seat atomically via `filledCount` decrement). Withdraw SHALL require explicit confirm and re-read the detail afterwards.

#### Scenario: Withdraw participation frees the seat
- **WHEN** a volunteer confirms withdraw on an accepted/active participation
- **THEN** the system posts the withdraw, re-reads the participation (status `withdrawn`), and surfaces success feedback.

### Requirement: Attestation and briefing downloads via shared blob helper
The system SHALL expose attestation downloads as streamed blob downloads through the single F0 helper (`lib/api/download.ts` `downloadBlob`: axios `responseType: 'blob'` + `Content-Disposition: attachment` filename, triggered save — never navigation, never a stored file URL) against `GET /api/v1/experiences/:experienceId/attestation`. The link SHALL render only where an experience exists for the participation; otherwise a neutral empty state SHALL render (no "Civic Recognition" wording, no transcript/audio affordances).

#### Scenario: Attestation downloads as attachment without navigation
- **WHEN** a volunteer clicks the attestation download for a completed participation with an experience
- **THEN** the system downloads the PDF via the shared blob helper (filename from `Content-Disposition`) without navigating away.

#### Scenario: No experience renders neutral empty state
- **WHEN** a participation has no linked experience
- **THEN** no download button renders and a neutral "not available yet" state is shown.

### Requirement: Activity strip on tasks
The system SHALL render a recent-activity strip from `GET /api/v1/volunteers/me/activity` (newest first) on the tasks route with loading/empty/error states.

#### Scenario: Activity strip renders newest first
- **WHEN** the tasks route loads
- **THEN** recent activity items render newest-first with loading/empty/error states.

### Requirement: No messaging UI and out-of-scope guards
The system SHALL NOT render coordinator-contact buttons, internal messaging, submission editing/uploading (F7-owned: `POST /participations/:participationId/submissions`, `PATCH /submissions/:submissionId`, `POST /submissions/:submissionId/submit`), or experience-visibility controls (F8-owned: `PATCH /experiences/:experienceId/visibility`).

#### Scenario: No contact or submission affordances
- **WHEN** either route renders
- **THEN** no "Contact coordinator", message-thread, evidence-upload, or visibility-toggle affordance exists in the DOM.

