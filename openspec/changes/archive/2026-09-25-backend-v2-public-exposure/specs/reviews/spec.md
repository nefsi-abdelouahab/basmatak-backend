## ADDED Requirements

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
