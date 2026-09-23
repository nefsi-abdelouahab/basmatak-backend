## MODIFIED Requirements

### Requirement: Delete media

The system SHALL expose `DELETE /media/:mediaId` (authenticated, owner only) performing a soft delete via `deletedAt`. Deletion SHALL be blocked when the media is referenced by a verified experience, by any submission not in a terminal state (`rejected`/`withdrawn`) — F6 — or by a portfolio item (`portfolioItemId` set, established by Session 14's linkage write); the request SHALL then fail with a business error (`409`). A non-owner SHALL receive `404`; already-deleted media SHALL resolve to `404`.

#### Scenario: Owner deletes unattached media

- **WHEN** the owner deletes media not attached to a verified experience, a live submission, or a portfolio item
- **THEN** the row is soft-deleted (`deletedAt` set) and hidden from reads

#### Scenario: Verified-experience-attached media protected

- **WHEN** the owner deletes media referenced by a verified experience
- **THEN** the delete fails with `409`

#### Scenario: Live submission evidence protected

- **WHEN** the owner deletes media referenced by a submission still in `draft`/`submitted`/`under_review`/`approved`
- **THEN** the delete fails with `409`

#### Scenario: Terminal submission evidence deletable

- **WHEN** the owner deletes media referenced only by a `rejected` submission
- **THEN** the media is soft-deleted

#### Scenario: Portfolio-item-attached media protected

- **WHEN** the owner deletes media whose `portfolioItemId` references a live portfolio item
- **THEN** the delete fails with `409`

#### Scenario: Non-owner cannot delete

- **WHEN** a user who is not the `ownerId` attempts delete
- **THEN** the response is `404`