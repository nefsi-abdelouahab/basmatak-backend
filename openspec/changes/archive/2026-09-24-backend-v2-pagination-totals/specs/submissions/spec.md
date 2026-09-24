## MODIFIED Requirements

### Requirement: Submissions collection
The system SHALL maintain a `submissions` collection owned by the submissions module (inventory §3, §2.12). Each document SHALL carry: `participantId` (ObjectId referencing `task_participants`, unique — one submission per participation, reused on resubmission), `volunteerId`, `opportunityId`, `positionId`, `organizationId` (denormalized from the participant/opportunity so the org inbox and detail route resolve ownership without joins), `deliverables` (the position's expected deliverable descriptors the volunteer must evidence), optional `title` (the volunteer’s contribution title), `description` (the volunteer's work report), `consentConfirmed` (Boolean, decision 6 — default `false`), `evidence` (array of `{ mediaId }` media references), `status` (default `draft`), and timestamps. Documents SHALL follow the S1 base options (timestamps, `versionKey: false`, `toJSON` ObjectId→string). Indexes SHALL include unique `participantId`, `(opportunityId, status)`, and `(volunteerId, status)` per §3.

#### Scenario: One submission per participation
- **WHEN** a submission exists for a `participantId` and a create is attempted for the same participant
- **THEN** the unique index rejects the insert and the route surfaces `409`

#### Scenario: Indexes back inbox and me queries
- **WHEN** the org inbox filters by `status`/`opportunityId` or the volunteer lists `GET /submissions/me`
- **THEN** the `(opportunityId, status)` and `(volunteerId, status)` indexes serve the queries

#### Scenario: New rows default to draft
- **WHEN** a submission row is created
- **THEN** its `status` is `draft` and `consentConfirmed` is `false`

### Requirement: Create a submission for a participation
The system SHALL expose `POST /participations/:participationId/submissions` (authenticated, volunteer owner of the participation) creating a `draft` submission. Its DTO SHALL accept optional `title`. The caller SHALL be the participant's `volunteerId`; the `deliverables`, `opportunityId`, `positionId`, and `organizationId` SHALL be derived from the participant's position. A participation that already has a submission SHALL fail with `409` (one submission per participation, §3 unique `participantId`). A participation the caller does not own SHALL be treated as not-found (`404`).

#### Scenario: Owner creates a draft
- **WHEN** the owning volunteer posts a create for their participation with an optional title
- **THEN** a `draft` submission is returned with the title when supplied and `deliverables` copied from the position

#### Scenario: Second create for same participant returns 409
- **WHEN** a create is attempted for a participation that already has a submission
- **THEN** the response is `409` and no second row is written

#### Scenario: Foreign participation is not found
- **WHEN** a caller who does not own the participation posts the create
- **THEN** the response is `404`

### Requirement: Edit a submission draft
The system SHALL expose `PATCH /submissions/:submissionId` (authenticated, volunteer owner) accepting any subset of `title`, `description`, `evidence`, and `consentConfirmed`. Edits SHALL only be allowed while the submission is `draft`. Editing a `rejected` submission SHALL first return it to `draft` via the `rejected → draft` transition and then apply the edit (decision 2: resubmission reuses the same record, unlimited). Editing a `submitted`, `under_review`, or `approved` submission SHALL fail with `409 INVALID_STATUS_TRANSITION`. Each evidence `mediaId` SHALL be validated through `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')`; foreign or absent media SHALL be rejected. A non-owner caller SHALL receive `404`.

#### Scenario: Draft edit applies
- **WHEN** the owning volunteer PATCHes a `draft` submission with a new `title`, `description`, or `evidence`
- **THEN** the changes are stored and the row stays `draft`

#### Scenario: Editing a rejected returns it to draft
- **WHEN** the owning volunteer PATCHes a `rejected` submission
- **THEN** the submission transitions `rejected → draft` (writing `status_histories`) and the edit is applied

#### Scenario: Live submission cannot be edited
- **WHEN** the owner PATCHes a `submitted` or `under_review` submission
- **THEN** the request fails `409 INVALID_STATUS_TRANSITION`

#### Scenario: Foreign evidence is rejected
- **WHEN** an evidence `mediaId` fails `MediaOwnership.assertFor` (absent, deleted, foreign, or wrong purpose)
- **THEN** the request fails with the assertion's error and no edit is stored

### Requirement: Organization verification inbox
The system SHALL expose `GET /organizations/me/submissions` (authenticated, organization role) returning the submissions of the caller's own opportunities only, filterable by comma-separated `?status=`, `?opportunityId=`, `?q=`, `?format=`, and a validated `?sort=` value from the inbox’s server-defined whitelist, with counted cursor pagination (default limit 20, max 50). Multiple selected status values SHALL include rows in any selected state, so `submitted,under_review` supplies the roadmap’s combined review tab; separate filter groups SHALL be combined. `q` SHALL search the roadmap’s volunteer, initiative, and deliverable surface without adding Session 17 response embeds. `format` SHALL filter by the submission evidence format. The query SHALL be scoped by the organization resolved from the JWT account (`organizations.userId → organizations._id`), so a non-owning org never observes another org's submissions and a volunteer caller SHALL receive `403`.

#### Scenario: Org sees only its own submissions
- **WHEN** an organization requests the inbox
- **THEN** only submissions whose `organizationId` equals its own organization are returned

#### Scenario: Multi-status review inbox
- **WHEN** the org requests `?status=submitted,under_review`
- **THEN** only its submissions in either selected status are returned and the total covers both statuses

#### Scenario: Search and format filters narrow the inbox
- **WHEN** the org supplies `q` and/or `format`
- **THEN** only its submissions matching the requested search or evidence-format filter are returned

#### Scenario: Sort values are validated
- **WHEN** the org requests an unlisted inbox `sort` value
- **THEN** validation rejects the request

#### Scenario: Foreign org submissions never leak
- **WHEN** two organizations each have submissions and one lists the inbox
- **THEN** the other organization's rows are absent regardless of pagination depth

#### Scenario: Volunteer cannot use the inbox
- **WHEN** a volunteer calls `GET /organizations/me/submissions`
- **THEN** the response is `403`
