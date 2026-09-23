# organizations Specification Change

## Purpose
Session 13 (trust layer): the publish-gate rule becomes real (replacing the inert seam), organizations can read their publish-gate state, reliability metrics are computed and cached, a job handler refreshes them, and reliability is exposed publicly per organization.

## Requirements

## MODIFIED Requirements

### Requirement: Organizations collection

The system SHALL provide an `organizations` collection with `userId` (ObjectId, unique — one organization per account per §9), `slug` (unique), `nameAr`/`nameFr`, `description`, `logoMediaId` (ObjectId-format optional, validated against `media` via `MediaOwnership.assertFor` with `purpose=organization_logo` — Session 8 retrofit of F9), `verificationStatus` (`pending | verified | rejected`, default `pending`), `status` (`active | suspended | deleted`, default `active`), and a `reliability` sub-document whose values are computed by the Session 13 trust layer and refreshed on submission events and the job tick. Indexes SHALL include unique `userId`, unique `slug`, and `(verificationStatus, status)`.

#### Scenario: One organization per account
- **WHEN** a second `organizations` row is inserted with the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Slug uniqueness enforced
- **WHEN** two `organizations` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

#### Scenario: Reliability recomputed and cached
- **WHEN** the reliability computation runs for an organization
- **THEN** the `organizations.reliability` sub-document stores the computed metrics with a `lastRefreshedAt` timestamp, replacing any placeholder values

## ADDED Requirements

### Requirement: Publish gate rule

The system SHALL provide a real publish-gate counter that replaces the inert `PublishGateService` default via Nest DI provider override without changing the opportunities module's code (A7, extension-seams contract). `evaluate(org)` SHALL count the distinct opportunities belonging to the org that have at least one submission in `submitted|under_review`; draft submissions and decided submissions SHALL never count, and an opportunity unlocks only when it has no pending submission left (whole-opportunity decision). The gate SHALL report locked when the pending count is greater than or equal to the `publishGate.maxPendingOpportunities` value from `system_settings` (default `3`), and a locked result SHALL turn the existing publish route into `409` with business code `PUBLISH_GATE_LOCKED`. When a gated publish resolves locked, the system SHALL emit the `publish-gate.locked` domain event so the notifications capability can notify the organization.

#### Scenario: Counter counts distinct pending opportunities
- **WHEN** an organization has one opportunity with two pending submissions and another opportunity with one
- **THEN** the count is `2` (one per distinct opportunity, not per submission)

#### Scenario: Drafts and decided submissions excluded
- **WHEN** an opportunity has only draft submissions or only `approved`/`rejected` submissions
- **THEN** it does not contribute to the pending count

#### Scenario: Whole opportunity decision unlocks
- **WHEN** an opportunity's last `submitted`/`under_review` submission is verified or rejected
- **THEN** the opportunity no longer counts toward the gate

#### Scenario: Threshold reached locks publish
- **WHEN** the pending count reaches `publishGate.maxPendingOpportunities` (default 3) on a publish attempt
- **THEN** `evaluate(org)` reports locked and the publish is blocked with `PUBLISH_GATE_LOCKED`

#### Scenario: Locked event emitted once per org
- **WHEN** a gated publish resolves locked for an organization
- **THEN** a `publish-gate.locked` event is emitted scoped to that organization (deduplicated by event name plus org id)

### Requirement: Publish-gate status read

The system SHALL expose `GET /organizations/me/publish-gate` (authenticated, organization role) returning `{ locked, pendingCount, threshold, pendingOpportunities[] }` where `locked` and `pendingCount` follow the same rule as the publish-gate counter, `threshold` is the `system_settings` value (default `3`), and `pendingOpportunities` lists the distinct opportunities currently counting toward the gate with their id and display fields. The route SHALL be declared before `/organizations/:slug` in its controller (§2.7 route-order trap).

#### Scenario: Reports state under the threshold
- **WHEN** a verified organization with one pending opportunity calls the route and the threshold is 3
- **THEN** the response reports `locked: false`, `pendingCount: 1`, `threshold: 3`, and that opportunity in `pendingOpportunities`

#### Scenario: Reports locked at the threshold
- **WHEN** the pending count equals or exceeds the threshold
- **THEN** the response reports `locked: true`

#### Scenario: Route order beats the slug route
- **WHEN** the controller is scanned
- **THEN** `me/publish-gate` is matched before `:slug` so `"me"` is never treated as a slug

#### Scenario: Non-organization isolated
- **WHEN** a volunteer or an account without an organization row calls the route
- **THEN** the response is `404` in the error envelope

### Requirement: Reliability computation

The system SHALL compute per-organization reliability from that organization's `submissions`, `verifications`, and `reviews` data: `responseRate` (decided submissions over uploaded ones — upload statuses `submitted|under_review|approved|rejected`; decided means `approved|rejected`), `decidedRatio` (decided submissions over all of the org's submissions including drafts), `medianDecisionMs` (median over the org's verification rows of `decidedAt − submission.createdAt`; an even-length set SHALL use the average of the two middle values), and an `anomaly` flag (true when the org's average `reviews.rating` exceeds the platform-wide average; the flag is only computable when both the org and the platform have at least one review, otherwise `false`). Metrics whose divisor is zero SHALL be omitted rather than stored as `0`.

#### Scenario: Ratios computed from a fixture
- **WHEN** an org has 2 drafts, 4 uploaded submissions of which 2 are decided
- **THEN** `responseRate` is `0.5` and `decidedRatio` is `0.4`

#### Scenario: Even-length median averaged
- **WHEN** the org has 4 verification rows with decision durations ordering to `[10, 20, 40, 90]` minutes
- **THEN** `medianDecisionMs` is the average of the two middle values (`30` minutes)

#### Scenario: Zero-upload guard
- **WHEN** an org has no uploaded submissions
- **THEN** the ratio metrics are omitted (not `0`)

#### Scenario: Anomaly flag derived from average rating
- **WHEN** the org's average `reviews.rating` is above the platform average
- **THEN** `anomaly` is `true`; otherwise (or with insufficient reviews) it is `false`

### Requirement: Reliability cache and refresh

The system SHALL cache the computed reliability into the org's `organizations.reliability` sub-document with `lastRefreshedAt`, and SHALL refresh it on the submission events that change the inputs (submitted/verified/rejected) and through a `reliabilityRecompute` handler registered in the S1 `JobRegistry` that runs on the job tick and recomputes all organizations idempotently.

#### Scenario: Event-driven refresh persists values
- **WHEN** a submission event fires for an organization
- **THEN** the org's cached reliability is recomputed and `lastRefreshedAt` is updated

#### Scenario: Job handler recomputes all orgs
- **WHEN** the job tick runs the `reliabilityRecompute` handler
- **THEN** every organization's `reliability` is recomputed (idempotent, no duplicate writes)

### Requirement: Public organization reliability

The system SHALL expose public `GET /organizations/:slug/reliability` returning the organization's cached reliability metrics only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope (same gating as the public organization seam).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug/reliability` for a verified, active organization
- **THEN** the cached reliability metrics are returned

#### Scenario: Non-verified or inactive hidden
- **WHEN** a guest calls the route for a `pending`/`rejected`/inactive/absent organization
- **THEN** the response is `404`