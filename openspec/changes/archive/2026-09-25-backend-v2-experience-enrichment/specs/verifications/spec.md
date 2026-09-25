## MODIFIED Requirements

### Requirement: Organization verifies a submission (transaction)
The system SHALL expose `POST /submissions/:submissionId/verify` (authenticated, organization role, owning organization) accepting `{ notes?, review? }`. Acting on the owning org's submission only (other orgs/volunteers → `404`), the route SHALL run the §5 verify transaction: submission `submitted|under_review → approved` (traversing `submitted → under_review` first when needed, both via `StatusTransitionService.assert`); participant of that participation → `completed` (via the registered `task_participant` whitelist `accepted|active → completed`); insert `verifications` (status `verified`, terminal); insert `volunteer_experiences` (snapshot title/description/skills, `duration` stamped from the opportunity's `durationMinutes` — the real hours behind all aggregates — falling back to `0` when the opportunity predates Session 11 fields, `evidenceIds` copied from the submission's evidence, generated `verificationCode` per A12); insert `reviews` when `review` is provided (one per submission, unique `submissionId`); `$inc` `volunteer_profiles.stats` (`completedTasks`, `verifiedExperiences`, `volunteerHours` by the stamped duration); and write status histories + the volunteer notification **inside the same Mongo transaction** (F4). `submission.verified` SHALL be emitted only after the transaction commits. A submission not in `submitted|under_review` (e.g. already `approved`) SHALL fail `409 INVALID_STATUS_TRANSITION` and write nothing (no double-verify).

#### Scenario: Full verify happy path
- **WHEN** the owning org posts verify on a `submitted|under_review` submission with notes and an optional review
- **THEN** after the transaction commits the submission is `approved`, its participant is `completed`, one `verified` verification row, one `volunteer_experiences` row with a generated `verificationCode` and the opportunity's real duration, and (when a review was sent) one `reviews` row exist, volunteer stats are incremented (hours by the stamped duration), and `submission.verified` is emitted

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

#### Scenario: Legacy opportunity mints zero duration
- **WHEN** the owning org verifies a submission whose opportunity has no `durationMinutes` (predates Session 11 fields)
- **THEN** the minted experience carries `duration: 0` and the transaction otherwise succeeds
