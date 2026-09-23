# reviews Specification Change

## Purpose
Session 13 (F16 owner-split) completes the reviews capability: the owning organization writes a review for a verified submission, volunteers read the reviews they received, and organizations read the reviews they gave. The schema/model and the atomic write during the verify flow remain as owned by the submissions change.

## Requirements

## MODIFIED Requirements

### Requirement: Reviews data layer

The system SHALL provide a `reviews` data layer (inventory §3, §2.16, F16 owner-split) covering the `Review` schema/model shared from `backend/src/reviews/review.schema.ts`, the in-transaction write during the verify flow, and the Session 13 controllers for the three §2.16 routes. A review is distinct from a verification: verification says "done", a review says "how well". Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one review per submission), `organizationId`, `volunteerId`, `rating` (the organization's score of the volunteer's work), and an optional `comment`. Indexes SHALL include unique `submissionId`, `organizationId`, and `volunteerId` per §3.

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

## ADDED Requirements

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