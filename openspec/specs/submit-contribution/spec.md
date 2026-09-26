# submit-contribution Specification

## Purpose
TBD - created by archiving change frontend-submit-contribution. Update Purpose after archive.
## Requirements
### Requirement: Submission draft create, read, and edit
The system SHALL manage the contribution draft via `POST /api/v1/participations/:participationId/submissions` (create; optional `title` ≤200), `GET /api/v1/submissions/:submissionId` and `GET /api/v1/submissions/me` (read), and `PATCH /api/v1/submissions/:submissionId` (edit `title` ≤200, `description` ≤5000, `evidence` ≤50 ObjectIds, `consentConfirmed` boolean). Editing a `rejected` submission SHALL return it to `draft` per backend transition.

#### Scenario: Draft created with title
- **WHEN** a volunteer opens `volunteer/tasks/[participationId]/submit` with no existing submission and saves a title
- **THEN** `POST /participations/:participationId/submissions` creates the draft and the UI reflects `draft` status (en+ar).

#### Scenario: Rejected returns to draft on edit
- **WHEN** a volunteer edits a `rejected` submission
- **THEN** `PATCH /submissions/:submissionId` persists the edit and status displays as `draft` with resubmit enabled.

#### Scenario: Duplicate create surfaces conflict
- **WHEN** a second create is attempted for the same participation (backend 409, one submission per participant)
- **THEN** the UI surfaces the conflict error and re-reads the existing submission instead of duplicating.

### Requirement: Evidence upload via v2-correct 2-step flow with progress
The system SHALL upload file evidence via `POST /api/v1/media/uploads` (purpose `submission_evidence`, defaults `private`) → PUT raw bytes to `uploadUrl` → `POST /api/v1/media/:mediaId/confirm`, composing the F2 `lib/api/media.ts` helper (import-only). Only `image/jpeg`, `image/png`, `image/webp`, `application/pdf` with size `1..5 MB` SHALL be accepted; oversize or wrong-type files SHALL be blocked client-side before any upload call. Upload progress SHALL be displayed during the PUT phase.

#### Scenario: Image/PDF upload succeeds with progress
- **WHEN** a volunteer selects a valid image or PDF and confirms
- **THEN** the 2-step flow completes, progress is shown, the confirmed `mediaId` joins draft `evidence`, and the gallery renders it.

#### Scenario: Oversize or wrong-type file rejected
- **WHEN** a file over 5 MB or not jpeg/png/webp/pdf (e.g. audio, video file, zip) is selected
- **THEN** upload is blocked with a validation error and no `POST /media/uploads` call is made; the "Up to 500 MB / video / audio / zip" copy never appears.

### Requirement: Video evidence as allowlisted external link
The system SHALL add video evidence only as an external link via `POST /api/v1/media/links` (purpose `submission_evidence`). Only hosts `youtube.com` (incl. subdomains), `youtu.be` (exact), and `drive.google.com` (incl. subdomains) SHALL be accepted; any other host SHALL be rejected client-side with a validation error naming the allowlist. Non-https URLs SHALL be rejected.

#### Scenario: Allowlisted link accepted
- **WHEN** a volunteer pastes a `https://youtube.com/...`, `https://youtu.be/...`, or `https://drive.google.com/...` URL
- **THEN** `POST /media/links` creates the link medium and it joins draft `evidence`.

#### Scenario: Non-allowlisted host rejected
- **WHEN** a volunteer pastes a URL on any other host (e.g. `https://vimeo.com/...`)
- **THEN** submit-link is blocked with a validation error and no `POST /media/links` call is made.

### Requirement: Evidence removal
The system SHALL remove evidence via `DELETE /api/v1/media/:mediaId` and drop the id from draft `evidence` via `PATCH /api/v1/submissions/:submissionId`.

#### Scenario: Evidence removed from draft
- **WHEN** a volunteer removes a gallery item or link in `draft` state
- **THEN** `DELETE /media/:mediaId` is called, the draft patch persists, and the gallery re-renders without the item.

### Requirement: Imagery-consent gate before submit
The system SHALL require an imagery-consent checkbox (`consentConfirmed`) preceding submit whenever evidence includes image/video media. Submit via `POST /api/v1/submissions/:submissionId/submit` SHALL be blocked client-side until the checkbox is checked in that case, and the backend `400 CONSENT_REQUIRED` SHALL be mapped to the checkbox error (never a surprise). Submit also requires `description` plus ≥1 evidence per position `deliverables`.

#### Scenario: Submit blocked without consent when imagery present
- **WHEN** a draft with image/video evidence and unchecked consent attempts submit
- **THEN** no `POST /submissions/:submissionId/submit` call is made and the consent error renders adjacent to the checkbox.

#### Scenario: Draft submits with consent
- **WHEN** a complete draft (`description` + ≥1 evidence + `consentConfirmed=true` when imagery present) is submitted
- **THEN** `POST /submissions/:submissionId/submit` transitions the record to `submitted` and the UI displays the submitted state.

### Requirement: Status display, resubmit loop, and scope guards
The system SHALL display the submission lifecycle states `draft`, `submitted`, `under_review`, `approved`, `rejected` (with reject reason where returned), support `rejected`→edit→`draft`→resubmit, and SHALL NOT render any messaging/coordinator-contact affordance. The org review actions (`start-review`, `verify`, `reject`) SHALL NOT be built here (F11 owns them). Guest access SHALL redirect to Login (decision 10). All UI strings SHALL come from the `submitContribution.*` catalog (en+ar, RTL-correct via logical properties); all styling SHALL read F0 theme tokens (no hardcoded values); all data SHALL flow through `hooks/useSubmissions.ts` (no ad-hoc fetch/axios); the screen SHALL render at 1440/1100/390.

#### Scenario: Rejected resubmits end to end
- **WHEN** a volunteer with a `rejected` submission edits fields and resubmits with consent
- **THEN** the record returns to `draft` on edit and to `submitted` on submit, with status history reflected.

#### Scenario: No messaging UI present
- **WHEN** the submit screen renders in any state or locale
- **THEN** no "Message coordinator" / clarification / contact affordance exists in the DOM.

#### Scenario: Loading, empty, and error states render
- **WHEN** the submission read is loading, missing (new draft), or fails (401/403/404/429/503 mapped via the F0 error shape)
- **THEN** loader, fresh-draft composer, or the matching error state renders with retry/login actions as appropriate.

