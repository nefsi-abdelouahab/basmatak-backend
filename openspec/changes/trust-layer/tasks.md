# Tasks: trust-layer

Each task 5–15 minutes. Tests are required per task group. All backend paths are relative to `backend/`.

## 1. Reviews write route
- [x] 1.1 Add `ReviewsController` in `src/reviews/reviews.controller.ts` exposing `POST /submissions/:submissionId/review` (organization role guard).
- [x] 1.2 Resolve the submission by `submissionId`; assert it belongs to the caller's organization (else `404`); accept only when status is `approved` (else `409 REVIEW_NOT_ALLOWED`).
- [x] 1.3 Add `CreateReviewDto` — `rating: 1..5` required, `comment?` optional `≤2000` — matching the schema constraints in `src/reviews/review.schema.ts`.
- [x] 1.4 Add `ReviewsService.writeReview(orgId, submission, dto)` inserting `{ submissionId, organizationId, volunteerId: submission.volunteerId, rating, comment }`; map `E11000` on the unique `submissionId` index to `409 REVIEW_ALREADY_EXISTS` (same helper/style as the verify flow).
- [x] 1.5 Unit tests for the write route (succeeds after verification, foreign/absent 404, not-yet-decided blocked, duplicate 409, rating bounds).

## 2. Reviews list routes
- [x] 2.1 Add `GET /volunteers/me/reviews` (volunteer role) — cursor-paginated, newest-first, filter `volunteerId = account.sub`.
- [x] 2.2 Add `GET /organizations/me/reviews` (organization role) — `organizationId` = caller's linked org (`404` when the account has no org row), cursor-paginated, newest-first, with submission/volunteer context for rendering.
- [x] 2.3 Register both routes in the reviews controller with the same pagination cursor helper used by the submissions change.
- [x] 2.4 Unit tests for both lists (received-only, empty page for a new volunteer, org isolation).

## 3. Real publish gate
- [x] 3.1 Create the trust module skeleton in `src/trust/` (imports MongooseModule for submissions/opportunities; depends only on `@Global` core providers).
- [x] 3.2 Implement `TrustPublishGateService` in `src/trust/publish-gate.service.ts` with `evaluate(org)` and a `countPendingOpportunities(orgId)` aggregation over submissions: distinct opportunities with ≥1 submission in `submitted|under_review` (drafts and decided excluded).
- [x] 3.3 Threshold = `SettingsService.get('publishGate.maxPendingOpportunities', 3)`; locked when count ≥ threshold; `PUBLISH_GATE_ENABLED=true` still forces locked.
- [x] 3.4 Override the token in `src/common/common.module.ts`: `{ provide: PublishGateService, useClass: TrustPublishGateService }`, import `TrustModule`. Do NOT change `src/opportunities/` publish code.
- [x] 3.5 Unit tests for the gate rule (distinct-opportunity counting, drafts/decided excluded, whole-opportunity unlock, threshold reached, demo lock override).

## 4. Publish-gate status read
- [x] 4.1 Add `GET /organizations/me/publish-gate` (organization role) returning `{ locked, pendingCount, threshold, pendingOpportunities[] }`, declared before any `/organizations/:slug` route in its controller.
- [x] 4.2 `pendingOpportunities[]` = distinct pending opportunities with id + display fields (`slug`, `title`).
- [x] 4.3 Routes return `404` for volunteers / accounts without an org row (same as `/organizations/me`).
- [x] 4.4 Unit/e2e tests (reports state under threshold, locked at threshold, route-order beats `:slug`, non-org isolated).

## 5. Publish-gate locked event
- [x] 5.1 Emit `DomainEvents.PublishGateLocked` when a gated publish evaluates locked, payload with the org record + `organizationId` so the S9 `notifyOrgFromPayload` resolves recipients.
- [x] 5.2 Verify S9's dedupe (event name + org id) is keyed per org so repeated blocked publishes do not re-notify.
- [x] 5.3 Unit test event emission and dedupe behavior.

## 6. Reliability computation + cache
- [x] 6.1 Implement `ReliabilityService.computeFor(orgId)` in `src/trust/reliability.service.ts`: `responseRate` = decided/uploads, `decidedRatio` = decided/all submissions, `medianDecisionMs` over verifications `decidedAt − submission.createdAt` (even-length → average of the two middle), `anomaly` = org avg `reviews.rating` > platform avg (only when both have ≥1 review). Zero-divisor metrics omitted.
- [x] 6.2 Persist into `organizations.reliability` via `$set` with `lastRefreshedAt` (winning write defeats the placeholder).
- [x] 6.3 Subscribe to the submitted/verified/rejected submission events and recompute the affected org after a settle delay.
- [x] 6.4 Register a `reliabilityRecompute` handler in `JobRegistry` at `TrustModule` bootstrap (like `opportunityStartTicker`), recomputing all orgs idempotently on the job tick.
- [x] 6.5 Unit tests: ratio fixture (2 drafts / 4 uploaded / 2 decided → 0.5 / 0.4), even-length median (`[10,20,40,90]` min → 30), zero-upload guard, anomaly flag.

## 7. Public reliability endpoint
- [x] 7.1 Add public `GET /organizations/:slug/reliability` returning cached reliability only for `verificationStatus=verified` AND `status=active` (else `404`).
- [x] 7.2 E2E: verified+active org returns metrics; pending/inactive/absent → 404.

## 8. Session routes (F7)
- [x] 8.1 Add `POST /auth/logout-all` to `src/auth/auth.controller.ts` delegating to the existing `AuthService.logoutAll` (deletes every session row for the user).
- [x] 8.2 Add `GET /users/me/sessions` and `DELETE /users/me/sessions/:sessionId` to `src/users/users.controller.ts` — own rows only, foreign/absent → `404`, response never includes the refresh-token hash; revoking the current session is allowed.
- [x] 8.3 Unit tests (logout-all revokes all sessions including current; list leaks no secrets; delete own/foreign/current session).

## 9. End-to-end and verification
- [x] 9.1 E2E trust flow: verify + review write + `409` duplicate + both lists + gate lock at 3 pending opportunities → publish blocked `PUBLISH_GATE_LOCKED` → decide a whole opportunity → unlocked + public reliability read + `opportunity.started` ticker still notifies participants.
- [x] 9.2 Run backend build, lint, unit tests, and the new E2E specs; fix failures.
- [x] 9.3 Run `openspec validate trust-layer` and `openspec status --change trust-layer`; confirm all artifacts pass.
- [ ] 9.4 Commit the change (no push).