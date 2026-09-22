## ADDED Requirements

### Requirement: Reviews data layer

The system SHALL provide a `reviews` data layer (inventory §3, §2.16, F16 owner-split) covering the `Review` schema/model shared from `backend/src/reviews/review.schema.ts` and the in-transaction write during the verify flow. A review is distinct from a verification: verification says "done", a review says "how well". Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one review per submission), `organizationId`, `volunteerId`, `rating` (the organization's score of the volunteer's work), and an optional `comment`. Indexes SHALL include unique `submissionId`, `organizationId`, and `volunteerId` per §3. In this session the reviews module SHALL define the schema/model only — NO controllers (the three §2.16 review routes and reliability are Session 13's Phase 2 work).

#### Scenario: Schema and model exist without controllers

- **WHEN** the application boots with this change
- **THEN** the `Review` model is registered from `backend/src/reviews/review.schema.ts` and the reviews module exposes no controllers for §2.16 routes

#### Scenario: One review per submission

- **WHEN** the verify transaction inserts a review for a `submissionId`
- **THEN** the unique `submissionId` index enforces at most one review; a second review for the same submission fails

#### Scenario: Review written atomically with verify

- **WHEN** the owning org posts verify with a `review` payload
- **THEN** the `reviews` row is inserted inside the verify transaction and commits (or rolls back) with the rest of the flow