## MODIFIED Requirements

### Requirement: Public feed
The system SHALL expose public `GET /opportunities` returning only opportunities whose status is exactly `published` (per §2.8 "Published only"), with cursor-based pagination (default limit 20, max 50 per §0) and the counted cursor-page metadata. Filters SHALL be supported: `q` (matches title/description, capped by a filter bound so the text index is not required for correctness — F11), `categoryId`, `skillId` (an opportunity whose positions include the skill), `wilayaId`, `municipalityId`, `from`/`to` (startDate bounds), and `hasOpenPositions` (true = at least one position with `filledCount < requiredCount`). Inputs represented by the feed’s multi-select filters SHALL accept comma-separated values, parsed consistently, with all selected filter constraints applied. `sort` SHALL accept only the feed’s server-defined whitelist and unknown values SHALL be rejected by DTO validation. An authenticated volunteer passing `nearMe=me` SHALL have the feed restricted using that caller’s volunteer-location wilaya. The `from`/`to` handling SHALL support the roadmap’s current-week and weekend windows using day-of-week boundaries.

#### Scenario: Published opportunities listed
- **WHEN** a guest calls `GET /opportunities` with no filters
- **THEN** the response is paginated and contains only opportunities whose status is published/visible

#### Scenario: Non-published hidden
- **WHEN** an opportunity is `draft`, `closed`, `cancelled`, or `completed`
- **THEN** it is absent from the feed

#### Scenario: Filters narrow the feed
- **WHEN** a guest calls the feed with `q`, `categoryId`, `skillId`, `wilayaId`, `municipalityId`, `from`, `to`, or `hasOpenPositions=true`
- **THEN** only matching opportunities are returned, and `hasOpenPositions=true` keeps only opportunities having at least one position with `filledCount < requiredCount`

#### Scenario: Multi-select filters apply together
- **WHEN** a caller supplies comma-separated values for a supported feed multi-select filter
- **THEN** the values are parsed as separate selected constraints and the returned total and items reflect the combined filter

#### Scenario: Near-me uses the caller’s wilaya
- **WHEN** an authenticated volunteer calls `GET /opportunities?nearMe=me`
- **THEN** the list contains only published opportunities matching that volunteer’s resolved wilaya

#### Scenario: Date-window filters use calendar bounds
- **WHEN** a caller supplies `from`/`to` for a current-week or weekend feed window
- **THEN** only published opportunities whose start dates fall within those day-of-week bounds are returned

#### Scenario: Sort values are validated
- **WHEN** a caller supplies a `sort` value outside the feed whitelist
- **THEN** validation rejects the request

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests `limit` greater than 50
- **THEN** the limit is clamped to 50
- **AND** subsequent pages advance via the `cursor` parameter

### Requirement: List own opportunities
The system SHALL expose `GET /organizations/me/opportunities` (authenticated, organization role) returning all of the owning organization's opportunities across every status, cursor-paginated (default limit 20, max 50) with counted cursor-page metadata. Each returned opportunity SHALL include its `registryId`. The list SHALL accept `q` across the roadmap’s title, location, and skill search surface and a validated `sort` value from its server-defined whitelist, while retaining the existing optional status filter and ownership isolation.

#### Scenario: All statuses returned
- **WHEN** an organization account calls `GET /organizations/me/opportunities`
- **THEN** the response lists its own opportunities in every status, including drafts, each carrying its `OPP-` registry identifier

#### Scenario: Search and sort narrow only own rows
- **WHEN** an organization supplies `q` or a valid `sort` value
- **THEN** only matching opportunities belonging to that organization are returned in the selected permitted order

#### Scenario: Unknown sort is rejected
- **WHEN** an organization supplies an unlisted `sort` value
- **THEN** validation rejects the request
