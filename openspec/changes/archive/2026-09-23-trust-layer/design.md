# Design: trust-layer

## Context

Session 13 is the trust layer. It ships the social-proof read model the platform still owes after Session 11 closed the volunteer loop:

- **F16 completion — review controllers** (inventory §3, §2.16). The `reviews` schema/model + the atomic review-on-verify write already exist (`backend/src/reviews/review.schema.ts`, model-only module). The three §2.16 routes are missing: the org writing a review for a verified submission, volunteers listing reviews they received, orgs listing reviews they gave.
- **A7 — real publish gate.** The S6 publish route still calls the inert S1 `PublishGateService` (`backend/src/common/seams/publish-gate.service.ts`), which only reports locked when `PUBLISH_GATE_ENABLED=true`. The §4/§7 decision-4 rule (distinct org opportunities with ≥1 submitted/under_review submission, threshold in `system_settings`) never runs.
- **F8 — reliability.** `organizations.reliability` is still a placeholder sub-document. Reliability must be computed from `submissions` + `verifications` timestamps, cached into the org document, refreshed by events + the job tick, and readable publicly per org.
- **F7 — P2 session routes.** `POST /auth/logout-all`, `GET /users/me/sessions`, `DELETE /users/me/sessions/:sessionId`.

The S9 notifications capability already registers the `opportunity.started` and `publish-gate.locked` domain-event handlers; the S6 ticker already emits `opportunity.started`. This session only verifies that wiring end-to-end.

## Goals / Non-Goals

**Goals**
- Review controllers that are safe (owning org only, post-verification only, one per submission) and fast (index-supported).
- A real publish-gate counter that honors the §7 decision-4 counting rule, replaces the inert default purely via DI, and never touches the opportunities module's publish code.
- Reliability metrics defined precisely enough to unit-test (ratios, even-length median, zero-divisor guards, anomaly flag) and stored in the existing `organizations.reliability` slot.
- The three P2 session routes with no credential leakage.

**Non-Goals**
- Admin hiding of reviews and the reports flow (S16).
- Push/real-time delivery of notifications (S9 stays en-queue).
- Schema migrations or new indexes beyond what exists.
- New packages or new env vars (the existing `PUBLISH_GATE_ENABLED` flag merely becomes a manual lock override).

## Decisions

### D1 — Review write route sits on submissions, org-only, gated by `approved`
`POST /submissions/:submissionId/review` resolves the submission, asserts the caller's organization owns it (else `404`), and only accepts it when the submission is `approved` (else `409 REVIEW_NOT_ALLOWED`). Body is `{ rating: 1..5, comment? ≤2000 }` validated by the DTO + schema. Duplicates are caught by the unique `submissionId` index: `E11000` → `409 REVIEW_ALREADY_EXISTS` (mirrors the verify-txn duplicate handling). `volunteerId` is taken from the submission, matching the Session 11 in-transaction write so both paths agree.

### D2 — Review list routes are cursor-paginated reads
`GET /volunteers/me/reviews` filters `volunteerId = account.sub`; `GET /organizations/me/reviews` filters `organizationId` = the org linked to the caller (no org → `404`, matching the orgs `me` pattern). Both use the same cursor pagination helper the submissions change used, newest-first. The org list joins submission/volunteer context for rendering.

### D3 — Real gate is a DI provider override in the seam's home
The real counter lives in a new `backend/src/trust/` module (`TrustPublishGateService` implementing `evaluate(org)`). `CommonModule` (the seam home) binds the `PublishGateService` token to it via `{ provide: PublishGateService, useClass: TrustPublishGateService }` and imports `TrustModule`. The opportunities module keeps injecting `PublishGateService` unchanged. `CoreModule` (settings, event bus, job registry) is `@Global`, so `TrustModule` needs no coupling that would create a cycle. `PUBLISH_GATE_ENABLED=true` still forces locked on top of the real count.

### D4 — Gate counter rule (decision 4, verbatim)
`evaluate(org)` = number of **distinct** opportunities belonging to `org` that have ≥1 submission in `submitted|under_review`. Drafts and `approved|rejected` submissions never count. An opportunity unlocks only when it has no pending submission left (whole-opportunity decision). Locked when count ≥ `get('publishGate.maxPendingOpportunities', 3)`. The `/organizations/me/publish-gate` route reuses the same counting query to return `{ locked, pendingCount, threshold, pendingOpportunities[] }`; it is declared before `/organizations/:slug` (§2.7 route-order trap).

### D5 — `publish-gate.locked` emitted from the gate, dedupe-protected
When a publish attempt evaluates locked, the trust gate emits `DomainEvents.PublishGateLocked` with a payload carrying the org record + `organizationId` so the S9 `notifyOrgFromPayload` helper can address the org admins. S9's dedupe (event name + org id) absorbs repeated locked evaluations; the event is keyed per org, so the org is not re-notified on every blocked publish.

### D6 — Reliability math (unit-testable)
Per org, computed from its own rows:
- `uploaded` = submissions with status `submitted|under_review|approved|rejected`
- `decided` = submissions with status `approved|rejected`
- `responseRate` = `decided / uploaded` (responsiveness of things actually uploaded)
- `decidedRatio` = `decided / allSubmissions` (includes drafts → exposes stuck-in-draft orgs)
- `medianDecisionMs` = median over the org's `verifications` rows of `decidedAt − submission.createdAt` (even-length set → average of the two middle values)
- `anomaly` = org's average `reviews.rating` > platform-wide average, only when both sides have ≥1 review; else `false`

Zero-divisor metrics are omitted (not stored as `0`). `Reliability.computeFor(orgId)` is a pure function fed by fixture-friendly queries so unit tests can pin the math (0.5/0.4 ratio fixture and the even-length median fixture in spec).

### D7 — Reliability cache + refresh
Results are written to `organizations.reliability` (winning via `$set`; last write wins) with `lastRefreshedAt`. The trust module subscribes to the submitted/verified/rejected submission events (event bus) and recomputes the affected org after a short settle delay; the S1 `JobRegistry` gets a `reliabilityRecompute` handler (registered at `TrustModule` bootstrap like `opportunityStartTicker`) that recomputes every org idempotently on the job tick. Stale cache tolerance is documented (see Risks).

### D8 — Session routes reuse existing auth primitives
`POST /auth/logout-all` calls the existing `AuthService.logoutAll(acc.sub)` (already used by change-password/delete-me) — all session rows for the user are deleted. `GET /users/me/sessions` and `DELETE /users/me/sessions/:sessionId` are added to `UsersController`; they operate on the caller's own user id only (foreign/absent → `404`), never project the refresh-token hash, and allow revoking the current session.

## Risks

- **`E11000` race** on the review route (two concurrent reviews for one submission): handled by the same `E11000` → `409` mapping used in the verify flow and covered by an e2e assertions.
- **Route shadowing** `me` vs `:slug`: the publish-gate and reviews `me` routes are declared explicitly before `:slug` routes; covered by route-order scenarios.
- **Stale reliability cache** between events and the job tick: acceptable (the cached metrics are advisory; events + tick bound the staleness); `lastRefreshedAt` lets the client/e2e see the age.
- **Multiple providers for the `PublishGateService` token** if the override is added in a second module: avoided by overriding exactly once, in `CommonModule`.
- **Perf of the counter query**: an aggregation on `(organizationId, status)` backed by the existing submissions indexes; the org slug route stays O(1) on the unique `slug` index.
- **Circular DI** between trust → common: none, because `TrustModule` only depends on `@Global` core providers.

## Migration

Additive and rollback-safe. No new schema fields (the `reliability` sub-document already exists), no new indexes, no new env vars, no data migration: on first boot the trust module seeds the reliability cache for all orgs via the `reliabilityRecompute` handler. Rollback = revert the change commit; the `PublishGateService` token backtracks to the inert default and all new routes stop being served.

## Open Questions

- Should `GET /organizations/me/reviews` include the volunteer name/username inline, or only the `volunteerId`? (Proposal: include a light volunteer context via a join; decided during implementation.)
- Does the org review list need the submission title too? (Follow the same join pattern.)
- Exact `reduce`/aggregate for `pendingOpportunities[]` display fields (slug + title) — settled at implementation; spec only pins id + display fields.