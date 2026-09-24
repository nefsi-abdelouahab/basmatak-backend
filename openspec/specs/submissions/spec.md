# submissions Specification

## Purpose
The submissions capability (§2.12): a `submissions` collection scoped one-per-participation, volunteer draft/submit/edit flows, the organization verification inbox, the review state machine (`draft → submitted → under_review → approved | rejected`, `rejected → draft`), and the ownership-scoped read model.
## Requirements
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

### Requirement: Submission approved outcome

The system SHALL write the `approved` terminal state as the outcome of the organization's verify action (Part B `approved` write path deferred from the state machine registration requirement). The `under_review → approved` transition SHALL be written through `StatusTransitionService.assert` inside the verify transaction, together with the submission row update to `approved` and the `verifications`, `volunteer_experiences`, participant-completion, stats, and notification writes. Only a submission currently `submitted` or `under_review` SHALL be verifiable; a submission in any other state (`draft`, `approved`, `rejected`) SHALL fail `409 INVALID_STATUS_TRANSITION` — so an already-`approved` submission can never be double-verified. After the transaction commits, `submission.verified` SHALL be emitted with the updated submission payload (the S9 handler notifies the volunteer; its post-commit insert is dedupe-swallowed because the notification was already written inside the transaction, F4).

#### Scenario: Verify approves a reviewed submission

- **WHEN** the owning org verifies an `under_review` submission
- **THEN** the submission becomes `approved`, a `status_histories` row records `under_review → approved`, and `submission.verified` is emitted after commit

#### Scenario: Verify on a submitted (not yet reviewed) submission

- **WHEN** the owning org verifies a `submitted` submission without first calling start-review
- **THEN** the verify transaction still approves it (the whitelist path `submitted → under_review → approved` is traversed within the same transaction) and no separate start-review call is required

#### Scenario: Already approved cannot be double-verified

- **WHEN** the owning org calls verify on an `approved` submission
- **THEN** the request fails `409 INVALID_STATUS_TRANSITION` and no state or proof rows are written

#### Scenario: Volunteer is notified after approval

- **WHEN** a submission is approved
- **THEN** the volunteer receives exactly one `submission.verified` notification (in-transaction write; the post-commit handler's row is swallowed by the shared `dedupeKey`)

### Requirement: Submission rejected outcome

The system SHALL write the `rejected` terminal state as the outcome of the organization's reject action (Part B `rejected` write path). The `under_review → rejected` transition SHALL be written through `StatusTransitionService.assert`, together with the submission row update to `rejected` and a `verifications` row of status `rejected` carrying the organization's reason (decision: the reason is retained on the `verifications` rejected row; the `status_histories` schema carries no free-text field — see design). Only a submission currently `submitted` or `under_review` SHALL be rejectable; any other state SHALL fail `409 INVALID_STATUS_TRANSITION`. `submission.rejected` SHALL be emitted so the volunteer is notified. The Part A edit rule then lets the volunteer return the record to `draft` and resubmit (rejected → draft, unlimited); each rejection keeps its `verifications` (rejected) row and reason.

#### Scenario: Reject writes the rejected state and reason

- **WHEN** the owning org rejects a `submitted` or `under_review` submission with a reason
- **THEN** the submission becomes `rejected`, a `status_histories` row records the transition, a `verifications` row of status `rejected` carries the reason, and `submission.rejected` is emitted

#### Scenario: Reject on a live submission is blocked

- **WHEN** the owning org calls reject on a `submitted` submission that was already rejected once and resubmitted
- **THEN** the current new submission must first be reviewed (`submitted → under_review`) like any other live submission; reject only acts on `submitted|under_review`

#### Scenario: Volunteer is notified after rejection

- **WHEN** a submission is rejected
- **THEN** the volunteer receives exactly one `submission.rejected` notification

#### Scenario: Rejected submission can be edited back to draft

- **WHEN** the volunteer PATCHes a `rejected` submission (Part A edit rule)
- **THEN** it returns to `draft` with a `rejected → draft` history row and can be submitted again, unlimited

