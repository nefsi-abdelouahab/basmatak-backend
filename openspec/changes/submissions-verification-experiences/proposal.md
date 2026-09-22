## Why

The core loop is open at the reporting stage: S7's accepted participation, S8's media, and S9's notification handlers (which already forward-registered `submission.submitted`) all exist, but there is no `submissions` collection, no way for a volunteer to report work, and no org inbox to review it. Session 9's `submission.submitted` handler is registered today and fires the moment this session emits the event — the write side is the only missing half.

## What Changes

- Add a `submissions` collection (owner: submissions module) with unique `participantId` (one submission per participation, reused on resubmission) and the §3 indexes `(opportunityId, status)`, `(volunteerId, status)`. Fields per §2.12: `deliverables`, `description`, `consentConfirmed` (Boolean, decision 6), `evidence` (media refs), `status` (`draft → submitted → under_review → approved|rejected`, with `rejected → draft` on edit).
- Add the eight §2.12 routes: `POST /participations/:participationId/submissions` (creates `draft`; 409 on a second create for the same participant), `PATCH /submissions/:submissionId` (draft edits; editing a `rejected` returns it to `draft`), `POST /submissions/:submissionId/submit` (draft→submitted; requires description + ≥1 evidence per `deliverables`; `consentConfirmed=true` required when evidence includes image/video, else `CONSENT_REQUIRED`), `GET /submissions/me`, `GET /submissions/:submissionId` (owner/org, includes media), `GET /organizations/me/submissions` (inbox, `?status=&opportunityId=`), `POST /submissions/:submissionId/start-review` (submitted→under_review; optional auto-start on first inbox open).
- Evidence entries validated through the S8 `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')` helper — foreign/absent media rejected.
- Register the `submission` transition whitelist with the S1 `StatusTransitionService` and emit `submission.submitted` on the S1 EventEmitter bus after a successful submit. The S9 `NotificationsEventHandlers` subscriber already exists; no new handler is registered.
- The `approved|rejected` write path is whitelisted now but implemented in **Part B** (S11) alongside verify/reject, verifications, experiences, and reviews.

## Capabilities

### New Capabilities
- `submissions`: collection + indexes, the draft-edit-submit flow with the consent rule, the volunteer `me`/detail routes, the org verification inbox, and the `submission` state machine registration + event emission.

### Modified Capabilities
<!-- No existing requirement changes: `media`/`extension-seams` already assert the S8 helper and the S9 register-and-defer notification contract, which this session merely consumes. -->

## Impact

- Backend: new `backend/src/submissions/` module (schema, service, controller, DTOs); additive wiring in `backend/src/app.module.ts`; register the `submission` whitelist + emit `submission.submitted` through the S1 seams (no notification-module changes).
- New E2E `backend/test/submissions.e2e-spec.ts`; unit tests for submit validation (description, evidence-per-deliverable, consent), the rejected→draft round-trip, and one-per-participant enforcement.
- `openspec/specs/submissions`. No new packages or env vars; no migration beyond the new collection (Part B will extend the same collection and status whitelist via MODIFIED deltas).