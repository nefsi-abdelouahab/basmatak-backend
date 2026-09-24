## Why

The apply screen lets an applicant write a cover message but the backend drops it, so "Why I want to participate" never reaches reviewers (RP §1.5#1, §2.4#6). The "Under review" tab is only a label — there is no `under_review` state, no way for an org to move an application into review, and accept/reject only act on `pending` (RP §2.4#1). And the org dashboard's "Recent applications" card is a cross-opportunity list (RP §2.1#6) that no single endpoint can serve today — reads are per-opportunity only. This session wires the cover message through, adds `under_review` as a real state with an org `start-review` transition, lets accept/reject decide from it, and exposes the org aggregate inbox `GET /organizations/me/applications`.

## What Changes

- `POST /opportunities/:opportunityId/positions/:positionId/applications` accepts an optional `message` (trimmed, ≤ 2000) stored on the application and immutable after apply (no edit route; it is a cover note, not a chat).
- Application state machine extended: `pending → under_review` (new), and accept / reject / withdraw all valid from `under_review` (the v2 machine is `pending | under_review`, then `accepted | rejected | withdrawn`). New org-only route `POST /applications/:applicationId/start-review` (`pending → under_review`, non-pending → 409). The partial "one live application per (position, volunteer)" dedupe index widens to include `under_review` so a row under review still blocks a duplicate.
- New org aggregate inbox `GET /organizations/me/applications` (`?status=&opportunityId=&q=` + cursor pagination) returning applications across the org's opportunities with plain projections, `q` matching the org's own opportunity/position titles. A new `(organizationId, status)` index backs it.
- New `ApplicationInboxJoiner` extension seam: interface + inert pass-through default in `src/common/seams/` consumed by the inbox. Session 17 (`org-embed-labels`) swaps in the real volunteer/org/opportunity/position name joins without touching the applications module (S1 seam convention).

## Capabilities

### New Capabilities
<!-- None: this change extends the existing `applications` capability only. The seam follows the extension-seam convention already specified in `openspec/specs/extension-seams`. -->

### Modified Capabilities
- `applications`: the collection requirement (status enum gains `under_review`, dedupe index widened, `(organizationId, status)` index); the apply requirement (accepts + stores `message`, immutable); the accept requirement (`pending | under_review → accepted`); the reject requirement (`pending | under_review → rejected`); plus ADDED requirements for `start-review`, the org aggregate inbox, and the `ApplicationInboxJoiner` seam that fills names in Session 17.

## Impact

- Backend: `applications` schema (`APPLICATION_STATUSES`, partial dedupe index filter, new `(organizationId, status)` index); `applications` controller + DTOs (apply body `message?`, `start-review`, aggregate inbox); `applications` service (apply message, `startReview`, status-aware accept/reject, inbox + seam consumption); `applications` module whitelist registration; new `backend/src/common/seams/application-inbox-joiner.ts` + `CommonModule` binding.
- Tests: unit (whitelist pairs, start-review, status-aware accept/reject, seam passthrough) + e2e (`backend/test/applications.e2e-spec.ts` extended).
- No new collections, packages, or env vars. Additive; the accept/reject transaction shapes are unchanged (only their from-status widens). Migration note: the partial dedupe index's `partialFilterExpression` changes, so existing deployments must recreate that index once.