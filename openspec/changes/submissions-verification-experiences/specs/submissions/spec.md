## ADDED Requirements

### Requirement: Submissions collection

The system SHALL maintain a `submissions` collection owned by the submissions module (inventory §3, §2.12). Each document SHALL carry: `participantId` (ObjectId referencing `task_participants`, unique — one submission per participation, reused on resubmission), `volunteerId`, `opportunityId`, `positionId`, `organizationId` (denormalized from the participant/opportunity so the org inbox and detail route resolve ownership without joins), `deliverables` (the position's expected deliverable descriptors the volunteer must evidence), `description` (the volunteer's work report), `consentConfirmed` (Boolean, decision 6 — default `false`), `evidence` (array of `{ mediaId }` media references), `status` (default `draft`), and timestamps. Documents SHALL follow the S1 base options (timestamps, `versionKey: false`, `toJSON` ObjectId→string). Indexes SHALL include unique `participantId`, `(opportunityId, status)`, and `(volunteerId, status)` per §3.

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

The system SHALL expose `POST /participations/:participationId/submissions` (authenticated, volunteer owner of the participation) creating a `draft` submission. The caller SHALL be the participant's `volunteerId`; the `deliverables`, `opportunityId`, `positionId`, and `organizationId` SHALL be derived from the participant's position. A participation that already has a submission SHALL fail with `409` (one submission per participation, §3 unique `participantId`). A participation the caller does not own SHALL be treated as not-found (`404`).

#### Scenario: Owner creates a draft

- **WHEN** the owning volunteer posts a create for their participation
- **THEN** a `draft` submission is returned with `deliverables` copied from the position

#### Scenario: Second create for same participant returns 409

- **WHEN** a create is attempted for a participation that already has a submission
- **THEN** the response is `409` and no second row is written

#### Scenario: Foreign participation is not found

- **WHEN** a caller who does not own the participation posts the create
- **THEN** the response is `404`

### Requirement: Edit a submission draft

The system SHALL expose `PATCH /submissions/:submissionId` (authenticated, volunteer owner) accepting any subset of `description`, `evidence`, and `consentConfirmed`. Edits SHALL only be allowed while the submission is `draft`. Editing a `rejected` submission SHALL first return it to `draft` via the `rejected → draft` transition and then apply the edit (decision 2: resubmission reuses the same record, unlimited). Editing a `submitted`, `under_review`, or `approved` submission SHALL fail with `409 INVALID_STATUS_TRANSITION`. Each evidence `mediaId` SHALL be validated through `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')`; foreign or absent media SHALL be rejected. A non-owner caller SHALL receive `404`.

#### Scenario: Draft edit applies

- **WHEN** the owning volunteer PATCHes a `draft` submission with a new `description` or `evidence`
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

#### Scenario: Foreign caller cannot patch

- **WHEN** a volunteer who does not own the submission PATCHes it
- **THEN** the response is `404` and the row is unchanged

### Requirement: Submit a submission

The system SHALL expose `POST /submissions/:submissionId/submit` (authenticated, volunteer owner) performing the `draft → submitted` transition. The request SHALL be validated first: a non-empty `description` is required; every entry in `deliverables` SHALL be covered by at least one evidence `mediaId`; and when the evidence includes image or video media, `consentConfirmed` MUST be `true` (decision 6) or the request SHALL fail with `400 CONSENT_REQUIRED`. Validation failures SHALL return `400` with a business code before any transition is written. On success the transition SHALL go through `StatusTransitionService.assert` (writing `status_histories`) and `submission.submitted` SHALL be emitted on the S1 EventEmitter bus with the submission's ids so the S9 handler creates the org notification. The emit SHALL occur only after the transition succeeds.

#### Scenario: Valid draft submits

- **WHEN** the owner submits a draft with a description, every deliverable evidenced, and consent satisfied
- **THEN** the status becomes `submitted`, a `status_histories` row is written, and `submission.submitted` is emitted exactly once

#### Scenario: Missing description rejected

- **WHEN** the owner submits with an empty or absent `description`
- **THEN** the request fails with a `400` business error and the status stays `draft`

#### Scenario: Unevidenced deliverable rejected

- **WHEN** a `deliverables` entry has no matching evidence `mediaId`
- **THEN** the request fails with a `400` business error and the status stays `draft`

#### Scenario: Consent required for image/video evidence

- **WHEN** the evidence includes image or video media and `consentConfirmed` is not `true`
- **THEN** the request fails with `400 CONSENT_REQUIRED` and no transition is written

#### Scenario: Non-owner cannot submit

- **WHEN** a volunteer who does not own the submission calls submit
- **THEN** the response is `404`

### Requirement: Submission state machine registration

The system SHALL register the `submission` entity transition whitelist with the S1 `StatusTransitionService` at module bootstrap: `draft → submitted`, `submitted → under_review`, `under_review → approved | rejected`, and `rejected → draft`. The whitelist SHALL contain the full machine now so Part B's `approved|rejected` write path works without re-registering; only the `approved|rejected` writes themselves are deferred to Part B. Registration SHALL be additive and SHALL NOT alter whitelists registered by other modules. Any transition outside the whitelist SHALL fail with `INVALID_STATUS_TRANSITION` and write no history.

#### Scenario: Whitelist active at bootstrap

- **WHEN** the application boots with the submissions module registered
- **THEN** `StatusTransitionService.assert` accepts the `submission` entity's registered `(from, to)` pairs

#### Scenario: Unlisted transition rejected

- **WHEN** an attempt is made to transition `draft → approved` directly
- **THEN** the call fails with `INVALID_STATUS_TRANSITION` and no `status_histories` row is written

### Requirement: Volunteer lists own submissions

The system SHALL expose `GET /submissions/me` (authenticated, volunteer) returning only the caller's own submissions, newest-first, cursor-paginated with the S1 convention (default limit 20, max 50), and optionally filtered by `status`. No other volunteer's rows SHALL appear regardless of pagination depth.

#### Scenario: Own submissions listed

- **WHEN** an authenticated volunteer requests `GET /submissions/me`
- **THEN** only rows with `volunteerId` equal to the caller are returned, ordered newest-first, paginated by the cursor convention

#### Scenario: Status filter narrows the list

- **WHEN** the volunteer requests `GET /submissions/me?status=draft`
- **THEN** only their `draft` rows are returned

### Requirement: Read a submission detail

The system SHALL expose `GET /submissions/:submissionId` (authenticated), returning the full submission including its evidence media metadata (resolved so the client can render signed URLs per the media read matrix). Access SHALL be limited to the owning volunteer (the submission's `volunteerId`) or an organization account owning the submission's opportunity (`organizationId` matching its own organization); any other caller SHALL receive `404` (non-owner treated as not-found, §6).

#### Scenario: Owner reads own submission

- **WHEN** the owning volunteer requests the submission detail
- **THEN** the submission and its evidence media metadata are returned

#### Scenario: Owning org reads submission

- **WHEN** the organization that owns the opportunity requests the detail
- **THEN** the submission and its evidence media metadata are returned

#### Scenario: Unrelated caller gets 404

- **WHEN** a volunteer who does not own the submission and an org that does not own the opportunity request the detail
- **THEN** the response is `404`

### Requirement: Organization verification inbox

The system SHALL expose `GET /organizations/me/submissions` (authenticated, organization role) returning the submissions of the caller's own opportunities only, filterable by `?status=` and `?opportunityId=`, cursor-paginated per the S1 convention (default limit 20, max 50). The query SHALL be scoped by the organization resolved from the JWT account (`organizations.userId → organizations._id`), so a non-owning org never observes another org's submissions and a volunteer caller SHALL receive `403`.

#### Scenario: Org sees only its own submissions

- **WHEN** an organization requests the inbox
- **THEN** only submissions whose `organizationId` equals its own organization are returned

#### Scenario: Inbox filtered by status and opportunity

- **WHEN** the org requests `?status=submitted&opportunityId=...`
- **THEN** only matching rows of its own opportunities are returned

#### Scenario: Foreign org submissions never leak

- **WHEN** two organizations each have submissions and one lists the inbox
- **THEN** the other organization's rows are absent regardless of pagination depth

#### Scenario: Volunteer cannot use the inbox

- **WHEN** a volunteer calls `GET /organizations/me/submissions`
- **THEN** the response is `403`

### Requirement: Organization starts a review

The system SHALL expose `POST /submissions/:submissionId/start-review` (authenticated, organization role, owning org) performing the `submitted → under_review` transition through `StatusTransitionService.assert`. The route MAY be invoked explicitly or triggered automatically when the owning org first opens the submission in the inbox; an automatic start SHALL be idempotent (a submission already `under_review` SHALL NOT re-transition or error). A non-owning org or volunteer SHALL receive `404`. A submission in any status other than `submitted` SHALL fail with `409 INVALID_STATUS_TRANSITION` on the explicit call.

#### Scenario: Submitted moves to under review

- **WHEN** the owning org calls start-review on a `submitted` submission
- **THEN** the status becomes `under_review` and a `status_histories` row is written

#### Scenario: Already under review is idempotent on inbox open

- **WHEN** the owning org opens an `under_review` submission in the inbox (implicit auto-start)
- **THEN** no second transition is written and no error is raised

#### Scenario: Non-owning org cannot start review

- **WHEN** an org that does not own the opportunity calls start-review
- **THEN** the response is `404`

#### Scenario: Wrong status rejected on explicit call

- **WHEN** the owning org calls start-review on a `draft` submission
- **THEN** the request fails `409 INVALID_STATUS_TRANSITION`