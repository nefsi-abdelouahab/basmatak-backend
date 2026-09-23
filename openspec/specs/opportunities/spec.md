# opportunities Specification

## Purpose
TBD - created by archiving change opportunities. Update Purpose after archive.
## Requirements
### Requirement: Opportunities collection
The system SHALL provide an `opportunities` collection with `organizationId`, `slug` (unique, generated server-side via the canonical `src/common/slug` pipeline per A12), `title`/`description`, `categoryId`, embedded `positions` (each with `title`, `description`, `requiredCount`, `filledCount` default `0`, `requiredSkills` as an array of `skillId` refs), `status` (`draft | published | in_progress | completed | closed | cancelled`, default `draft`), `startDate` (optional), `applicationDeadline` (optional), and `location { wilayaId, municipalityId, coordinates }`. Indexes SHALL include unique `slug`, `(status, startDate)`, `(status, categoryId)`, `(status, location.wilayaId)`, `(status, location.municipalityId)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description` (reserved per the F11 decision; not referenced by queries), and `positions.requiredSkills.skillId` per §3. Per the F11 canonical decision, keyword search SHALL be implemented as `$regex` bounded by an early `categoryId` equality, and geo filtering SHALL be implemented via the indexed `location` equality fields; no query SHALL reference the text index.

#### Scenario: Slug uniqueness enforced
- **WHEN** two opportunity rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert
- **AND** slug generation retries with a numeric suffix until the unique index accepts it

#### Scenario: Indexes back the feed and lifecycle queries
- **WHEN** opportunities are queried by status and startDate, by organization and status, by geo coordinates, by keyword, or by a required skill
- **THEN** each of those query shapes is served by a corresponding index in the collection

#### Scenario: Feed search decision is index-backed
- **WHEN** the public feed filters by status together with `categoryId`, `location.wilayaId`, `location.municipalityId`, keyword (`$regex` with an early `categoryId` bound when provided), or `startDate`
- **THEN** an `explain()`-asserted plan shows the query led by a corresponding `(status, …)` compound index with no collection scan

### Requirement: Opportunity lifecycle state machine
The system SHALL register the `opportunity` entity whitelist in `StatusTransitionRegistry` at module bootstrap with the §5 machine: `draft → published`, `published → in_progress`, `in_progress → completed`, `published | in_progress → closed`, and `published | in_progress → cancelled`. Participant activation (`accepted → active`, the job path, §7 decision 7) SHALL also be registered as an `opportunity` entity transition so the job asserts it through `StatusTransitionService`. Every route-driven transition SHALL go through `StatusTransitionService.assert('opportunity', opportunityId, from, to, actor)`, which writes `status_histories`.

#### Scenario: Valid transitions accepted
- **WHEN** an authorized caller triggers `draft → published`, `published → in_progress` (job), `in_progress → completed`, `published → closed`, `published → cancelled`, or `in_progress → cancelled`
- **THEN** `StatusTransitionService` accepts the transition, writes a `status_histories` entry, and returns it

#### Scenario: Invalid transitions rejected
- **WHEN** a caller attempts a pair outside the whitelist (e.g. `draft → completed`, `completed → published`, or `closed → in_progress`)
- **THEN** the call fails with business code `INVALID_STATUS_TRANSITION`
- **AND** no `status_histories` document is written

#### Scenario: Participant activation path registered
- **WHEN** the start-date job asserts the `accepted → active` transition for an `opportunity` entity
- **THEN** it validates against the registered whitelist rather than a not-registered error

### Requirement: Public feed
The system SHALL expose public `GET /opportunities` returning only opportunities whose status is exactly `published` (per §2.8 "Published only"), ordered by recency, with cursor-based pagination (default limit 20, max 50 per §0). Filters SHALL be supported: `q` (matches title/description, capped by a filter bound so the text index is not required for correctness — F11), `categoryId`, `skillId` (an opportunity whose positions include the skill), `wilayaId`, `municipalityId`, `from`/`to` (startDate bounds), and `hasOpenPositions` (true = at least one position with `filledCount < requiredCount`).

#### Scenario: Published opportunities listed
- **WHEN** a guest calls `GET /opportunities` with no filters
- **THEN** the response is paginated and contains only opportunities whose status is published/visible

#### Scenario: Non-published hidden
- **WHEN** an opportunity is `draft`, `closed`, `cancelled`, or `completed`
- **THEN** it is absent from the feed

#### Scenario: Filters narrow the feed
- **WHEN** a guest calls the feed with `q`, `categoryId`, `skillId`, `wilayaId`, `municipalityId`, `from`, `to`, or `hasOpenPositions=true`
- **THEN** only matching opportunities are returned, and `hasOpenPositions=true` keeps only opportunities having at least one position with `filledCount < requiredCount`

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests `limit` greater than 50
- **THEN** the limit is clamped to 50
- **AND** subsequent pages advance via the `cursor` parameter

### Requirement: Public opportunity detail
The system SHALL expose public `GET /opportunities/:idOrSlug` (resolving either a 24-hex ObjectId or a slug) returning the opportunity with its positions and open seats only when the opportunity's status is `published`. For any other status (draft, closed, cancelled, completed, in_progress — F5), the route SHALL return `404` in the error envelope. The owning organization reads its own opportunities (any status) via `GET /organizations/me/opportunities`.

#### Scenario: Published opportunity readable
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a published opportunity
- **THEN** the opportunity detail with positions and open seats is returned

#### Scenario: Non-published is 404
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a draft, closed, cancelled, or completed opportunity (or for a nonexistent id/slug)
- **THEN** the response is `404`

### Requirement: Recommended feed
The system SHALL expose `GET /opportunities/recommended` (authenticated, volunteer role) returning a rule-based, cursor-paginated feed (S1 convention, default 20, max 50) computed from the caller's own `volunteer_profiles`/`volunteer_skills` data (the same sources as S4). Only opportunities with `status=published` and at least one position with `filledCount < requiredCount` SHALL be candidates. Candidates SHALL be ranked by a deterministic score combining (a) skill-topic/level overlap between the volunteer's skills and the winning position's `requiredSkills`, (b) location match on `location.wilayaId`, and (c) recency, with stable tie-breaking. The route SHALL be declared before `GET /opportunities/:idOrSlug` in the controller so `recommended` is not shadowed by the `:idOrSlug` catch-all. No ML/search — a plain query per §0.

#### Scenario: Published open opportunities recommended
- **WHEN** a volunteer calls `GET /opportunities/recommended` and matching published opportunities with open positions exist
- **THEN** the response is a cursor-paginated list of those opportunities, ordered deterministically by score

#### Scenario: Non-published and full opportunities excluded
- **WHEN** an opportunity is `draft`, `closed`, `cancelled`, or `completed`, or has no position with `filledCount < requiredCount`
- **THEN** it is absent from the recommended feed

#### Scenario: Scored by skills, location and recency
- **WHEN** a volunteer has higher skill-overlap with one opportunity and a same-wilaya match with another
- **THEN** the higher-overlap / matched-wilaya opportunities rank above lower-overlap, mismatched-wilaya ones, with ties resolved deterministically so two calls with the same data return the same order

#### Scenario: No skill or location data still returns a feed
- **WHEN** a volunteer has no `volunteer_skills` or no `location`
- **THEN** the feed degrades gracefully (the skill/location components contribute nothing) and returns the published open-opportunity set, deterministically ordered

#### Scenario: Route not shadowed
- **WHEN** a volunteer calls `GET /opportunities/recommended`
- **THEN** the request resolves to the recommended handler, not the `:idOrSlug` detail handler

### Requirement: Create opportunity
The system SHALL expose `POST /organizations/me/opportunities` (authenticated, organization role) creating an opportunity with `status=draft`, a server-generated unique `slug` from the title, and the supplied embedded `positions` (each with `title`, `description`, `requiredCount` ≥ 1, `requiredSkills` of existing active skill ids). The organization is resolved from the token's user via `organizations.userId`; an account without an `organizations` row SHALL receive `404`.

#### Scenario: Draft created with positions
- **WHEN** an organization account posts an opportunity with positions
- **THEN** an opportunity row is created with `status=draft`, a generated `slug`, and the positions as embedded documents

#### Scenario: Invalid positions rejected
- **WHEN** a payload includes a position with `requiredCount < 1` or a `requiredSkills` entry that is not a valid skill id
- **THEN** the request is rejected by validation

### Requirement: List own opportunities
The system SHALL expose `GET /organizations/me/opportunities` (authenticated, organization role) returning all of the owning organization's opportunities across every status, newest first, cursor-paginated (default 20, max 50).

#### Scenario: All statuses returned
- **WHEN** an organization account calls `GET /organizations/me/opportunities`
- **THEN** the response lists its own opportunities in every status, including drafts

#### Scenario: Other organizations isolated
- **WHEN** an organization account calls the route
- **THEN** it only ever sees opportunities whose `organizationId` matches its own organization

### Requirement: Update opportunity
The system SHALL expose `PATCH /opportunities/:opportunityId` (authenticated, organization role, owning org only). Before publish the editable set SHALL be the full profile (title, description, categoryId, startDate, applicationDeadline, location); after publish it SHALL be limited to a small safe set (e.g. description, applicationDeadline forward-only) and only while the opportunity has no `accepted` participants. `slug`, `organizationId`, `status`, and `positions` SHALL NOT be settable from the body.

#### Scenario: Draft fully editable
- **WHEN** a draft opportunity of the owning org is patched with profile fields
- **THEN** the fields are updated

#### Scenario: Published edit limited and gated
- **WHEN** a published opportunity with no accepted participants is patched with the limited safe fields
- **THEN** the safe fields are updated
- **AND** a patch attempting unsupported fields (or applied after an accepted participant exists) is rejected

#### Scenario: Non-owner rejected
- **WHEN** an account that is not the owning organization patches the opportunity
- **THEN** the response is `404` in the error envelope

### Requirement: Delete opportunity
The system SHALL expose `DELETE /opportunities/:opportunityId` (authenticated, organization role, owning org only) that hard-deletes the row only while `status=draft`; for any other status the request SHALL be rejected (e.g. `409` with a business code) — the only hard-delete exception per §0.

#### Scenario: Draft deleted
- **WHEN** the owning organization deletes a draft opportunity
- **THEN** the row is removed (hard delete)

#### Scenario: Non-draft not deletable
- **WHEN** the owning organization attempts to delete a published or later opportunity
- **THEN** the request is rejected and the row is kept

### Requirement: Publish opportunity
The system SHALL expose `POST /opportunities/:opportunityId/publish` (authenticated, organization role, owning org only) that transitions `draft → published` through `StatusTransitionService`. Publishing SHALL require the owning organization to have `verificationStatus=verified` AND `status=active` (§7 decision 7, §6), otherwise `403` with business code `ORG_NOT_VERIFIED`. Before applying the transition the route SHALL call `PublishGateService#evaluate(org)`; the inert default reports unlocked (A7), and when `PUBLISH_GATE_ENABLED=true` and the gate reports locked the response SHALL be `409` with business code `PUBLISH_GATE_LOCKED`.

#### Scenario: Verified active org publishes
- **WHEN** the owning organization is `verified` and `active` and the gate is unlocked
- **THEN** the opportunity transitions to `published` and appears in the public feed

#### Scenario: Unverified org blocked
- **WHEN** the owning organization is `pending`/`rejected` or non-`active`
- **THEN** the response is `403` with business code `ORG_NOT_VERIFIED` and the status stays `draft`

#### Scenario: Gate-locked demo path
- **WHEN** `PUBLISH_GATE_ENABLED=true` and `evaluate(org)` reports locked
- **THEN** the response is `409` with business code `PUBLISH_GATE_LOCKED`

### Requirement: Close, cancel and complete transitions
The system SHALL expose `POST /opportunities/:opportunityId/{close,cancel,complete}` (authenticated, organization role, owning org only), each routed through `StatusTransitionService`. `close` and `cancel` SHALL be allowed from `published | in_progress`; `complete` SHALL be allowed from `in_progress` (opportunity completion is manual — §7 decision 5). `cancel` SHALL emit the documented `opportunity.cancelled` event.

#### Scenario: Close stops applications
- **WHEN** a `published` or `in_progress` opportunity is closed by the owning org
- **THEN** it transitions to `closed` and is removed from the public feed

#### Scenario: Cancel from active lifecycle
- **WHEN** a `published` or `in_progress` opportunity is cancelled by the owning org
- **THEN** it transitions to `cancelled`, is removed from the public feed, and `opportunity.cancelled` is emitted

#### Scenario: Complete from in_progress
- **WHEN** an `in_progress` opportunity is completed by the owning org
- **THEN** it transitions to `completed`

### Requirement: Positions management
The system SHALL expose positions CRUD under `/opportunities/:opportunityId/positions` (authenticated, organization role, owning org only): `POST` adds a position, `PATCH /positions/:positionId` edits one, `DELETE /positions/:positionId` removes one. The seat rule `requiredCount >= filledCount` SHALL be enforced on create, patch, and delete (a patch may never drop `requiredCount` below `filledCount`, and a delete is refused once `filledCount > 0`). Position add/patch SHALL be allowed on drafts freely and on published opportunities only while no `accepted` participants exist; delete SHALL additionally be refused while any application references the position (§2.8).

#### Scenario: Position added with seats
- **WHEN** the owning org adds a position with `requiredCount` and skills to a draft
- **THEN** the position is embedded and `filledCount` starts at `0`

#### Scenario: Seat count never below filled
- **WHEN** a patch attempts to set `requiredCount` below the position's `filledCount`
- **THEN** the request is rejected
- **AND** a delete of a position with `filledCount > 0` is also rejected

#### Scenario: Published gate on position edits
- **WHEN** the owning org attempts to add or edit positions on a published opportunity that already has an accepted participant
- **THEN** the request is rejected

### Requirement: Start-date job ticker
The system SHALL register the `opportunityStartTicker` handler in the S1 `JobRegistry`. On a run it SHALL find opportunities `{ status: 'published', startDate: { $lte: now } }` (index-backed) and for each: transition `published → in_progress` via `StatusTransitionService` (asserting `accepted → active` per registered opportunity-path whitelist) and set every matching `accepted` participant of its positions to `active`, and emit `opportunity.started`. The handler SHALL be idempotent so a double run activates each participant exactly once, and SHALL complete without error when `startDate` is unset.

#### Scenario: Started opportunity activates
- **WHEN** the job runs and an opportunity is `published` with `startDate` in the past
- **THEN** the opportunity becomes `in_progress`, its `accepted` participants become `active`, and `opportunity.started` is emitted

#### Scenario: Double run is idempotent
- **WHEN** the job runs twice against the same set
- **THEN** the second run transitions no additional states and activates no participant twice

#### Scenario: No start date no-op
- **WHEN** the job runs and an opportunity is `published` without a `startDate`
- **THEN** the handler skips it (the transition stays eligible for a later trigger)

