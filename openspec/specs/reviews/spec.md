# reviews Specification

## Purpose
The reviews capability (F16 owner-split): the owning organization writes a review for a verified submission, volunteers read the reviews they received, and organizations read the reviews they gave.
## Requirements
### Requirement: Reviews data layer
The system SHALL provide a `reviews` data layer (inventory §3, §2.16, F16 owner-split) covering the `Review` schema/model shared from `backend/src/reviews/review.schema.ts`, the in-transaction write during the verify flow, and the controllers for the three §2.16 routes. A review is distinct from a verification: verification says "done", a review says "how well". Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one review per submission), `organizationId`, `volunteerId`, `rating` (the organization's score of the volunteer's work), an optional `comment`, and a `status` field (`visible | hidden`, default `visible`) used for moderation hiding. Indexes SHALL include unique `submissionId`, `organizationId`, and `volunteerId` per §3; no additional index is required for the hide flag.

#### Scenario: Schema and model exist with controllers

- **WHEN** the application boots with this change
- **THEN** the `Review` model is registered from `backend/src/reviews/review.schema.ts` and the reviews module exposes the three §2.16 controllers

#### Scenario: One review per submission

- **WHEN** the verify transaction inserts a review for a `submissionId`
- **THEN** the unique `submissionId` index enforces at most one review; a second review for the same submission fails
- **AND** a duplicate review through the write controller is surfaced as `409` with business code `REVIEW_ALREADY_EXISTS`

#### Scenario: Review written atomically with verify

- **WHEN** the owning org posts verify with a `review` payload
- **THEN** the `reviews` row is inserted inside the verify transaction and commits (or rolls back) with the rest of the flow

#### Scenario: New reviews default to visible

- **WHEN** a review is created (in-transaction or via the write controller)
- **THEN** its `status` field is `visible` unless explicitly set to `hidden` by the admin hide route

### Requirement: Organization writes a review
The system SHALL expose `POST /submissions/:submissionId/review` (authenticated, organization role) so the owning organization reviews a completed submission on its own opportunity. The route SHALL resolve the submission and accept the request only when the submission belongs to the caller's organization and is already `approved` (verification happened). For an absent or foreign submission the response SHALL be `404` in the error envelope; for a submission not yet decided the response SHALL be `409` with business code `REVIEW_NOT_ALLOWED`. The body SHALL be `{ rating: 1..5, comment? ≤2000 }` validated against the schema. A second review for the same submission SHALL be rejected with `409` and business code `REVIEW_ALREADY_EXISTS` (unique `submissionId` index, `E11000`-mapped).

#### Scenario: Review after verification succeeds

- **WHEN** the owning organization calls `POST /submissions/:submissionId/review` for an `approved` submission with a valid `rating`
- **THEN** a `reviews` row is created for that submission and the review is returned

#### Scenario: Foreign or absent submission hidden

- **WHEN** the submission does not exist or belongs to another organization
- **THEN** the response is `404` in the error envelope

#### Scenario: Submission not yet decided blocked

- **WHEN** the submission is still `submitted`/`under_review` (or draft/rejected)
- **THEN** the response is `409` with business code `REVIEW_NOT_ALLOWED`

#### Scenario: Duplicate review rejected

- **WHEN** a review already exists for the submission (`E11000`)
- **THEN** the response is `409` with business code `REVIEW_ALREADY_EXISTS`

#### Scenario: Rating bounds enforced

- **WHEN** the `rating` is outside 1..5 or the `comment` exceeds 2000 characters
- **THEN** the request is rejected by DTO/schema validation

### Requirement: Volunteer lists received reviews
The system SHALL expose `GET /volunteers/me/reviews` (authenticated, volunteer role) returning the reviews addressed to the caller (`volunteerId` = the caller's user id), newest-first, and returning only reviews they received (never reviews they gave or any other volunteer's). Unbounded results SHALL be avoided with cursor pagination.

#### Scenario: Volunteer sees own received reviews

- **WHEN** a volunteer calls `GET /volunteers/me/reviews`
- **THEN** the response lists only reviews whose `volunteerId` matches the caller's user id, newest first

#### Scenario: Empty list for a new volunteer

- **WHEN** a volunteer has received no reviews
- **THEN** the response is an empty page with the correct pagination shape, not an error

### Requirement: Organization lists given reviews
The system SHALL expose `GET /organizations/me/reviews` (authenticated, organization role) returning the reviews written by the caller's organization (`organizationId` = the org linked to the caller), newest-first, with each review plus the reviewed submission/volunteer context needed to render the list. Unbounded results SHALL be avoided with cursor pagination.

#### Scenario: Organization sees own given reviews

- **WHEN** an organization calls `GET /organizations/me/reviews`
- **THEN** the response lists only reviews whose `organizationId` matches the caller's own organization, newest first

#### Scenario: Non-organization isolated

- **WHEN** the caller is a volunteer or has no organization row
- **THEN** the response is `404` in the error envelope

### Requirement: Review hiding and hidden-exclusion from reliability
The system SHALL support hiding a review: the `Review` schema SHALL carry a `status` field (enum `visible | hidden`, default `visible`), and the admin review-hide route SHALL set it to `hidden`. Hidden reviews SHALL be excluded from both the organization's own reliability derivation and the platform-wide average used for the `anomaly` flag (the S1/§4 reliability sources `reviews.rating`), so a hidden review can no longer influence any public metric. The existing review indexes SHALL be preserved unchanged.

#### Scenario: Review created visible by default
- **WHEN** a review is created through the verify flow or write controller
- **THEN** its `status` defaults to `visible` and all existing reads and metrics include it

#### Scenario: Hidden review excluded from org reliability
- **WHEN** a review's `status` is `hidden`
- **THEN** the organization's average rating used by `ReliabilityService` excludes that rating, and a platform-average comparison never counts it on either side

#### Scenario: Un-hide path absent this session
- **WHEN** a review is hidden
- **THEN** no public endpoint or metric re-adds it without another admin action (no un-hide route in this change)

### Requirement: Public volunteer reviews
The system SHALL expose public `GET /volunteers/:username/reviews` (guest, no auth) returning the neutral reviews addressed to that volunteer. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` in the error envelope. For an enabled profile the response SHALL be cursor-paginated (S1 convention, default 20, max 50, newest-first, with `total`/`page`/`pages` per the pagination-totals contract) and SHALL contain only `reviews` rows with `status=visible`; `hidden` rows SHALL never appear. Each row SHALL expose the neutral review content (`rating`, `comment`) plus the writing organization identity (`organizationId`, slug, display names); no volunteer-private fields SHALL be included. This listing endpoint does NOT depend on any `show*` flag beyond the master `enabled` gate.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username/reviews` for an unknown username or a profile with `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Only visible reviews listed
- **WHEN** a guest reads the reviews of a volunteer who has both `visible` and `hidden` reviews
- **THEN** only the `visible` rows are returned, newest-first, cursor-paginated, each carrying its rating, comment, and writing-organization identity

#### Scenario: Guest access needs no authentication
- **WHEN** an unauthenticated guest calls `GET /volunteers/:username/reviews`
- **THEN** the request succeeds with `200` (no `401`/`403`)

#### Scenario: Empty list for a volunteer with no visible reviews
- **WHEN** a volunteer has received no `visible` reviews
- **THEN** the response is an empty page with the correct pagination shape, not an error

