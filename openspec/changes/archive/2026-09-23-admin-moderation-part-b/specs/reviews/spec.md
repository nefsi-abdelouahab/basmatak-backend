## ADDED Requirements

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

## MODIFIED Requirements

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