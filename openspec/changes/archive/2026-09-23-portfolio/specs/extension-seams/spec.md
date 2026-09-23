## MODIFIED Requirements

### Requirement: Portfolio query seam

The system SHALL provide a `PortfolioQueryService` seam that Session 14 SHALL upgrade from its inert default (which returned empty portfolio/experience results) to the real read over `portfolio_items`: `getPublicPortfolio(username)` SHALL resolve the volunteer profile by username — an unknown username or a profile whose `publicProfile.enabled=false` SHALL surface the A5 `404` signal — and SHALL return the volunteer's `visibility=public` items ordered by `order`, each with media metadata restricted to `visibility=public` media rows. The upgrade SHALL swap the provider binding via Nest DI without changing the interface or the depending consumers' code (`extension-seams` convention).

#### Scenario: Inert default empty results

- **WHEN** a public portfolio query is issued through the seam's default binding
- **THEN** the seam returns an empty-but-correct result shape

#### Scenario: Real read returns public items

- **WHEN** the real binding serves a public portfolio query for an enabled profile
- **THEN** it returns only `visibility=public` items ordered by `order`, with private media excluded

#### Scenario: Disabled or unknown profile reads as 404

- **WHEN** the real binding serves a query for an unknown username or a `publicProfile.enabled=false` profile
- **THEN** the result signals `404` per the A5 contract

#### Scenario: Swap is source-compatible

- **WHEN** Session 14 binds the real provider
- **THEN** consumers calling `getPublicPortfolio(username)` compile unchanged against the same interface