# verifications Specification

## Purpose
The verifications capability (§2.13): a terminal-only `verifications` collection, the transactional verify route, the reject route, the ownership-scoped detail read, and the public possession-based proof route.

## Requirements
### Requirement: Verifications collection

The system SHALL maintain a `verifications` collection owned by the verifications module (inventory §3, §2.13, §5). Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one verification row per submission), `organizationId`, `volunteerId` (denormalized), `status` (`verified | rejected`), `notes` (optional, for `verified` rows), `reason` (optional, for `rejected` rows), `decidedAt`, and `decidedBy` (the deciding org account's user id). Rows SHALL be created terminal only (`verified` on approve, `rejected` on reject) — no `pending` state is ever created (F12: the `verifications` state machine `pending → verified | rejected` is unreachable by design and the terminal states are inserted directly). Indexes SHALL include unique `submissionId` and `(organizationId, status)` per §3.

#### Scenario: Verify inserts a verified row

- **WHEN** the verify transaction approves a submission
- **THEN** a `verifications` row with status `verified`, the deciding org's user id, and any notes is created for that submission

#### Scenario: Reject inserts a rejected row with reason

- **WHEN** the reject flow rejects a submission with a reason
- **THEN** a `verifications` row with status `rejected` and the reason is created for that submission

#### Scenario: One verification row per submission

- **WHEN** multiple decision attempts target the same `submissionId`
- **THEN** the unique `submissionId` index allows at most one row (a second insert fails)

#### Scenario: No pending verification ever exists

- **WHEN** the application runs any submission decision flow
- **THEN** no `verifications` row is ever created with a `pending` status

### Requirement: Organization verifies a submission (transaction)

The system SHALL expose `POST /submissions/:submissionId/verify` (authenticated, organization role, owning organization) accepting `{ notes?, review? }`. Acting on the owning org's submission only (other orgs/volunteers → `404`), the route SHALL run the §5 verify transaction: submission `submitted|under_review → approved` (traversing `submitted → under_review` first when needed, both via `StatusTransitionService.assert`); participant of that participation → `completed` (via the registered `task_participant` whitelist `accepted|active → completed`); insert `verifications` (status `verified`, terminal); insert `volunteer_experiences` (snapshot title/description/skills/duration, `evidenceIds` copied from the submission's evidence, generated `verificationCode` per A12); insert `reviews` when `review` is provided (one per submission, unique `submissionId`); `$inc` `volunteer_profiles.stats` (`completedTasks`, `verifiedExperiences`, `volunteerHours`); and write status histories + the volunteer notification **inside the same Mongo transaction** (F4). `submission.verified` SHALL be emitted only after the transaction commits. A submission not in `submitted|under_review` (e.g. already `approved`) SHALL fail `409 INVALID_STATUS_TRANSITION` and write nothing (no double-verify).

#### Scenario: Full verify happy path

- **WHEN** the owning org posts verify on a `submitted|under_review` submission with notes and an optional review
- **THEN** after the transaction commits the submission is `approved`, its participant is `completed`, one `verified` verification row, one `volunteer_experiences` row with a generated `verificationCode`, and (when a review was sent) one `reviews` row exist, volunteer stats are incremented, and `submission.verified` is emitted

#### Scenario: Verify traverses submitted without start-review

- **WHEN** the owning org verifies a `submitted` submission that was not first moved to `under_review` by start-review
- **THEN** the transaction moves it `submitted → under_review → approved` and succeeds (no separate start-review call needed)

#### Scenario: Double-verify blocked

- **WHEN** the owning org posts verify on an `approved` submission
- **THEN** the request fails `409 INVALID_STATUS_TRANSITION` and no verification, experience, review, or stat change is written

#### Scenario: Foreign org cannot verify

- **WHEN** an org that does not own the opportunity (or a volunteer) posts verify
- **THEN** the response is `404` (non-owner treated as not-found, §6)

#### Scenario: Verify rolls back atomically

- **WHEN** any step of the verify transaction fails after earlier steps succeeded (e.g. a duplicate `verificationCode`, a failed stats write, a stubbed dependency)
- **THEN** the whole transaction rolls back — no verification, no experience, no review, no stat change, submission still `submitted|under_review` — and `submission.verified` is not emitted

#### Scenario: In-transaction notification is not duplicated

- **WHEN** the verify transaction commits with the volunteer notification written inside it
- **THEN** the post-commit `submission.verified` handler's insert is swallowed by the shared `dedupeKey` so exactly one notification row exists

### Requirement: Organization rejects a submission

The system SHALL expose `POST /submissions/:submissionId/reject` (authenticated, organization role, owning organization) accepting `{ reason }` (required). Acting on the owning org's submission only (other orgs/volunteers → `404`), the route SHALL: transition the submission `submitted|under_review → rejected` through `StatusTransitionService.assert` (traversing `submitted → under_review` first when needed) and insert a `verifications` row with status `rejected` carrying the `reason`. The volunteer SHALL be notified via `submission.rejected`. A submission not in `submitted|under_review` SHALL fail `409 INVALID_STATUS_TRANSITION`. The reject path is explicitly non-transactional (per §5/roadmap) — missing binding-commit atomicity with the emitted event is acceptable.

#### Scenario: Reject writes rejected state and reason

- **WHEN** the owning org posts reject with a reason on a `submitted|under_review` submission
- **THEN** the submission becomes `rejected`, a `status_histories` row records the transition, a `verifications` row of status `rejected` carries the reason, and `submission.rejected` is emitted

#### Scenario: Reject without reason rejected

- **WHEN** the owning org posts reject without a `reason`
- **THEN** the request fails a `400` validation error and nothing is written

#### Scenario: Foreign org cannot reject

- **WHEN** an org that does not own the opportunity (or a volunteer) posts reject
- **THEN** the response is `404`

### Requirement: Read a verification detail

The system SHALL expose `GET /verifications/:verificationId` (authenticated) returning the verification row including its `status`, `notes`/`reason`, `decidedAt`, and `decidedBy`. Access SHALL be limited to the owning volunteer (`volunteerId` matches the caller) or the owning organization (`organizationId` matches the caller's own organization, resolved from JWT); any other caller SHALL receive `404`.

#### Scenario: Volunteer reads own verification

- **WHEN** the verification's `volunteerId` matches the caller
- **THEN** the verification detail is returned

#### Scenario: Org reads its verification

- **WHEN** the caller's own organization equals the verification's `organizationId`
- **THEN** the verification detail is returned

#### Scenario: Unrelated caller gets 404

- **WHEN** a volunteer who does not own the verification and an org that does not own the opportunity request the detail
- **THEN** the response is `404`

### Requirement: Public verification proof

The system SHALL expose `GET /verify/:verificationCode` (public, guest) resolving a `volunteer_experiences` row by its unique `verificationCode` (A6). An absent or invalid code SHALL result in `404`. On success it SHALL return the A6 public summary: the experience snapshot (`title`, `description`, `skills`, `duration`), the volunteer identity as allowed by the volunteer's `publicProfile` settings, and evidence media metadata limited to `visibility: public` media only (private media SHALL NOT be exposed, per §6). The proof SHALL resolve for a row regardless of the experience's `publicVisibility` (possession-based proof — the code is only known to the holder).

#### Scenario: Valid code returns summary

- **WHEN** a guest requests `/verify/:code` with a row's generated code
- **THEN** the experience summary including the volunteer handle and only `public` evidence media is returned

#### Scenario: Private evidence excluded

- **WHEN** the experience's evidence includes some `visibility: private` media rows
- **THEN** those rows are absent from the proof response

#### Scenario: Unknown code is 404

- **WHEN** a guest requests `/verify/:code` with an unknown or malformed code
- **THEN** the response is `404`

#### Scenario: Proof works for a private experience

- **WHEN** a guest holds the code of an experience whose `publicVisibility` is `private`
- **THEN** the summary is still returned (possession-based, A6)