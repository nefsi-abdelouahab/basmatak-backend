## ADDED Requirements

### Requirement: Discover talents feed with facet filters
The system SHALL list public talent cards on `volunteer/talents` from `GET /api/v1/talents` supporting `q` (max 120), single/multi `skillId`/`skillIds`, `categoryId`, single/multi `wilayaId`/`wilayaIds`, `minExperiences`, `hasAvailability` (boolean-string), `portfolio` (boolean-string), server-whitelisted `sort` (`newest`|`oldest`|`experiences_desc`), and cursor paging (`cursor`, `limit` default 20 max 50).

#### Scenario: Talent search, filter, sort, and paginate
- **WHEN** a volunteer sets keyword, skill/wilaya multi-selects, thresholds, sort, or page on `volunteer/talents`
- **THEN** `GET /talents` is called with the matching params and the grid re-renders from `CursorPage { items, nextCursor, limit, total, page, pages }`.

### Requirement: Talent result counts and facet totals
The system SHALL render result-count banners on `volunteer/talents` sourced from the response `total`, plus facet counts where returned. Counts SHALL never be derived client-side from `items.length`.

#### Scenario: Talent banner reflects server total
- **WHEN** any talents query returns
- **THEN** the banner shows the response `total` (and `page`/`pages`), including the zero-result empty state with a clear-filters action.

### Requirement: Talent cards from public projection with save state
The system SHALL render each talent card (username, names, headline/bio excerpt, public stats, availability indicator, portfolio count) exclusively from the `GET /talents` public projection plus `isFavorited` card state. The system SHALL NOT render contact/invite actions (no messaging UI exists).

#### Scenario: Talent card renders without contact actions
- **WHEN** talent items render
- **THEN** each card shows public stats/availability/portfolio counts and a Save toggle, and no contact/invite button appears.

### Requirement: Talent filter lookups reuse shared endpoints
The system SHALL source talent filter options from `GET /api/v1/skill-categories`, `GET /api/v1/skills`, and `GET /api/v1/locations/wilayas` (same lookup functions as the opportunities feed, no duplicated endpoint wrappers).

#### Scenario: Talent facets populate from lookups
- **WHEN** the talents filter panel opens
- **THEN** skill/category/wilaya options populate from the shared lookup calls.

### Requirement: Talents loading, empty, and error states
The system SHALL provide loading, empty, and error states on `volunteer/talents` for 401/403/404/429/503 via the F0 error mapping.

#### Scenario: Talent states render correctly
- **WHEN** the talents feed is loading, empty, or fails with a mapped code
- **THEN** the matching skeleton/empty/error state renders with retry.
