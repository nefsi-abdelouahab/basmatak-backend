## Why

Session 11 closed the core loop, but the platform still lacks the social proof that makes a volunteer marketplace trustworthy: the three §2.16 review routes never shipped (F16 completes the reviews split), the publish gate is still the Session 1/6 inert seam (A7), reliability metrics exist only as a placeholder (F8), and three P2 session routes are orphaned (F7). Session 13 lands all of it in one change.

## What Changes

- **Review controllers (F16):** `POST /submissions/:submissionId/review` (owning org, only after the submission is `approved`, rating + optional comment, unique `submissionId` → `409 REVIEW_ALREADY_EXISTS`), `GET /volunteers/me/reviews`, `GET /organizations/me/reviews`.
- **Real publish gate:** replaces the S6 inert `PublishGateService` via Nest DI provider override (opportunities module code untouched). Counter = distinct opportunities of the org with ≥1 submission in `submitted|under_review` (drafts never count); locked when count ≥ `publishGate.maxPendingOpportunities` from `system_settings` (default 3); unlock when a whole opportunity is decided. `GET /organizations/me/publish-gate` → `{ locked, pendingCount, threshold, pendingOpportunities[] }`; publish blocked with `PUBLISH_GATE_LOCKED`; emits `publish-gate.locked`.
- **Reliability (F8):** computed from `submissions` + `verifications` timestamps (response rate, decided-vs-uploaded ratio, median time to decide) plus the anomaly flag (org's average `reviews.ratings` vs platform average); cached into `organizations.reliability`; refreshed on submission events + a `reliabilityRecompute` handler registered in the S1 `JobRegistry`. Public `GET /organizations/:slug/reliability`.
- **Session routes (F7):** `POST /auth/logout-all`, `GET /users/me/sessions`, `DELETE /users/me/sessions/:sessionId`.
- **opportunity.started notification:** the S9 handler is already registered; this change proves it end-to-end (ticker → participant notifications) with E2E coverage.

**Out of scope:** admin hiding of reviews (S16), reports (S16), anything push/real-time.

## Capabilities

### New Capabilities
<!-- None -- every capability below already exists; some (reviews) are still pending archive from the submissions change. -->

### Modified Capabilities
- `reviews`: adds the three §2.16 review controllers (write after verification, volunteer list, organization list) to the existing data layer.
- `organizations`: adds the real publish-gate counter + status route, the reliability computation/cache + job handler, and the public reliability endpoint.
- `auth`: adds `POST /auth/logout-all` (F7), completing the logout requirement.
- `users`: adds own-session list and single-session revoke (F7).
- `extension-seams`: documents that the real publish-gate provider replaces the inert default (swap-in contract fulfilled).

## Impact

- Backend: new trust module (`backend/src/trust/`) hosting the real `PublishGateService` provider, `ReliabilityService`, the reliability job handler and the two §2.18 routes; additive review controllers in `backend/src/reviews/`; additive routes in `backend/src/auth/auth.controller.ts` and `backend/src/users/users.controller.ts`; additive provider override in `backend/src/common/common.module.ts`; `JobRegistry` gets `reliabilityRecompute`. No new packages, no new env vars.
- Collections/deltas: `openspec/specs/reviews`, `organizations`, `auth`, `users`, `extension-seams`. No schema changes beyond the already-present `organizations.reliability` and `reviews` indexes.
- Rollback: revert the commit; the seam default returns (`PUBLISH_GATE_ENABLED=false`).