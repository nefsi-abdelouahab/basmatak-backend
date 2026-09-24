## Why

The core loop is open at the reporting stage: S7's accepted participation, S8's media, and S9's notification handlers (which already forward-registered `submission.submitted`, `submission.verified`, and `submission.rejected`) all exist, but there is no `submissions` collection, no way for a volunteer to report work, and no org inbox to review it. Session 9's `submission.submitted` handler is registered today and fires the moment this session emits the event — the write side is the only missing half. Part B closes the loop: the org decides, the verify transaction mints proof, and `volunteer_experiences` with a public `verificationCode` feeds Session 12's public profiles.

## What Changes

- Add a `submissions` collection (owner: submissions module) with unique `participantId` (one submission per participation, reused on resubmission) and the §3 indexes `(opportunityId, status)`, `(volunteerId, status)`. Fields per §2.12: `deliverables`, `description`, `consentConfirmed` (Boolean, decision 6), `evidence` (media refs), `status` (`draft → submitted → under_review → approved|rejected`, with `rejected → draft` on edit).
- Add the eight §2.12 routes: `POST /participations/:participationId/submissions` (creates `draft`; 409 on a second create for the same participant), `PATCH /submissions/:submissionId` (draft edits; editing a `rejected` returns it to `draft`), `POST /submissions/:submissionId/submit` (draft→submitted; requires description + ≥1 evidence per `deliverables`; `consentConfirmed=true` required when evidence includes image/video, else `CONSENT_REQUIRED`), `GET /submissions/me`, `GET /submissions/:submissionId` (owner/org, includes media), `GET /organizations/me/submissions` (inbox, `?status=&opportunityId=`), `POST /submissions/:submissionId/start-review` (submitted→under_review; optional auto-start on first inbox open).
- Evidence entries validated through the S8 `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')` helper — foreign/absent media rejected.
- Register the `submission` transition whitelist with the S1 `StatusTransitionService` and emit `submission.submitted` on the S1 EventEmitter bus after a successful submit. The S9 `NotificationsEventHandlers` subscriber already exists; no new handler is registered.
- Add `verifications`, `volunteer_experiences` models + indexes (§3) and the `Review` schema/model shared from `backend/src/reviews/review.schema.ts` (F16 owner-split — no controllers; S13 adds them).
- Add the Part B routes: `POST /submissions/:submissionId/verify` (`{ notes?, review? }`), `POST /submissions/:submissionId/reject` (`{ reason }`), `GET /verifications/:verificationId` (owner/org), `GET /verify/:verificationCode` (public, A6), experiences `GET /experiences/me`, `GET /experiences/:experienceId` (owner, includes evidence + review), `PATCH /experiences/:experienceId/visibility` (`{ publicVisibility }`).
- Implement the **verify transaction** (§5 + F4/F12/F16): submission `submitted|under_review → approved`; participant → `completed`; insert `verifications` (terminal `verified`, F12); insert `volunteer_experiences` (snapshots title/description/skills/duration, `evidenceIds`, generated `verificationCode` per A12 — 8 uppercase base32 chars, no 0/O/1/I, collision-retried); insert `reviews` when `review` provided; `volunteer_profiles.stats` `$inc` (`completedTasks`, `verifiedExperiences`, `volunteerHours`); status histories + notifications **inside the transaction**; emit `submission.verified` only **after commit**.
- Implement **reject** (non-transactional): insert `verifications` (`rejected`) + submission → `rejected` + reason; emit `submission.rejected`.

## Capabilities

### New Capabilities
- `submissions`: collection + indexes, the draft-edit-submit flow with the consent rule, the volunteer `me`/detail routes, the org verification inbox, and the `submission` state machine registration + Part B `approved|rejected` write path + event emission.
- `verifications`: `verifications` collection + indexes, the verify transaction (`POST /submissions/:submissionId/verify`), reject (`POST /submissions/:submissionId/reject`), the verification detail read, and the public `/verify/:verificationCode` proof endpoint (A6 summary, public media only).
- `experiences`: `volunteer_experiences` collection + indexes, terminal-only creation via the verify transaction, `verificationCode` generation (A12), and the `me`/detail/visibility routes.
- `reviews`: `Review` data layer (schema/model in `backend/src/reviews/review.schema.ts`, unique `submissionId` — one per submission, in-transaction write during verify). No controllers (F16; S13 owns them).

### Modified Capabilities
<!-- No existing requirement changes: `media`/`extension-seams` already assert the S8 helper and the S9 register-and-defer notification contract, which this session merely consumes; `notifications` already forward-registers `submission.verified|rejected` and the S7/S11 in-transaction pattern. -->

## Impact

- Backend: new `backend/src/submissions/`, `backend/src/verifications/`, `backend/src/experiences/` modules; additive `backend/src/reviews/review.schema.ts` (model only, no controllers — F16); additive wiring in `backend/src/app.module.ts`; register the `submission` whitelist + emit `submission.submitted|verified|rejected` through the S1 seams (no notification-module changes).
- New E2E `backend/test/submissions.e2e-spec.ts` (Part A) and `backend/test/verifications.e2e-spec.ts` (Part B); unit tests for submit validation, the verify transaction (rollback never leaves partial rows), `verificationCode` uniqueness (A12), stats increments, and experience evidence copies.
- `openspec/specs/submissions`, `openspec/specs/verifications`, `openspec/specs/experiences`, `openspec/specs/reviews`. No new packages or env vars; no migration beyond the new collections (Part B extends the same change with the `verifications`/`experiences`/`reviews` capabilities).