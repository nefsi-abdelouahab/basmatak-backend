# opportunity-feed Specification

## Purpose
TBD - created by archiving change frontend-volunteer-home. Update Purpose after archive.
## Requirements
### Requirement: Filterable opportunities feed from list endpoint
The system SHALL list opportunities on `volunteer/opportunities` from `GET /api/v1/opportunities` supporting `q`, multi-value `categoryId`/`skillId`/`wilayaId`/`municipalityId` (comma-separated), `from`/`to` (ISO, incl. derived week/weekend windows), `hasOpenPositions`, `nearMe=me`, server-whitelisted `sort`, and cursor paging (`cursor`, `limit` default 20 max 50). Filter state SHALL serialize to query params so results are shareable and re-applied on reload.

#### Scenario: Search, filter, sort, and paginate
- **WHEN** a volunteer sets keyword, filters, sort, or page on `volunteer/opportunities`
- **THEN** `GET /opportunities` is called with the matching params and the list re-renders from `CursorPage { items, nextCursor, limit, total, page, pages }`.

#### Scenario: Week and weekend windows map to date bounds
- **WHEN** a volunteer selects the "this week" or "weekend" shortcut
- **THEN** the client derives `from`/`to` ISO bounds for the current week/weekend and queries with them (no backend change).

### Requirement: Recommended opportunities strip
The system SHALL render a recommended strip on `volunteer/opportunities` from `GET /api/v1/opportunities/recommended` (cursor paging only), using the same card component as the main feed.

#### Scenario: Recommended strip renders
- **WHEN** an authenticated volunteer opens `volunteer/opportunities`
- **THEN** the recommended strip loads from `GET /opportunities/recommended` and each card links to the F5 detail route without duplicating feed logic.

### Requirement: Result-count banners from total
The system SHALL render result-count banners (e.g. "N opportunities") on `volunteer/opportunities` sourced from the `total` field of the `CursorPage` response, including the zero-result empty state. Counts SHALL never be computed client-side from `items.length`.

#### Scenario: Banner reflects server total
- **WHEN** any feed query returns
- **THEN** the banner shows the response `total` (and `page`/`pages` for pagination), including "0 results" with a clear-filters action when `total` is 0.

### Requirement: Opportunity cards from embeds without N+1
The system SHALL render each opportunity card's org name, verified badge, and `OPP-<registryId>` exclusively from the embedded `organization` object and labels in the feed payload. The system SHALL NOT issue per-card detail requests (no N+1). Duration display SHALL derive from real `durationMinutes`.

#### Scenario: Card shows embed data only
- **WHEN** feed items render
- **THEN** each card shows title, org name + verified badge, `OPP-<registryId>`, mode/dates/duration (from `durationMinutes`), and save state — all from the list payload with zero per-card fetches.

### Requirement: Feed facet lookups for filters
The system SHALL source filter options from `GET /api/v1/skill-categories`, `GET /api/v1/skills`, `GET /api/v1/locations/wilayas`, and `GET /api/v1/locations/wilayas/:wilayaId/municipalities` (municipalities loaded lazily per selected wilaya).

#### Scenario: Facet selects populate from lookups
- **WHEN** the opportunities filter panel opens
- **THEN** category/skill/wilaya selects populate from their endpoints and the municipality select loads only after a wilaya is chosen.

### Requirement: Feed loading, empty, and error states
The system SHALL provide loading, empty, and error states on `volunteer/opportunities` for 401/403/404/429/503 via the F0 error mapping. Details/apply actions are out of scope (F5) — cards link out, they do not apply inline.

#### Scenario: Feed states render correctly
- **WHEN** the feed is loading, empty, or fails with a mapped code
- **THEN** the matching skeleton/empty/error state renders with retry, and no apply/withdraw/report UI appears on this route.

