# public-talent-discovery Specification

## Purpose
TBD - created by archiving change frontend-public-talent. Update Purpose after archive.
## Requirements
### Requirement: Public talent directory with server-defined filters, facets, and paging

The system SHALL provide a public talent directory at route `(public)/talents` backed by `GET /talents`. It SHALL support the server-defined query surface: free-text `q`; single or comma-separated facet filters `skillId`, `categoryId`, `wilayaId`; multi-select `skillIds` and `wilayaIds`; the thresholds `minExperiences`, `hasAvailability`, and `portfolio`; the whitelisted `sort` (`newest | oldest | experiences_desc`); and cursor paging via `cursor` and `limit` (default 20, max 50). Results SHALL be read from the cursor page's `total`, `page`, and `pages`, and the returned `facets` object SHALL populate the skill and wilaya filter option counts. Any `sort` value outside the whitelist SHALL be rejected client-side before a request is sent. The route SHALL follow the 4 mandates (theme tokens only, `publicTalent` catalog strings only with en+ar and RTL logical properties, centralized API layer + TanStack Query only, responsive at 1440/1100/390).

#### Scenario: Directory lists talents with totals and facet counts

- **WHEN** a guest opens `/{locale}/talents` with no filters
- **THEN** the grid lists the first page of talent cards, the count banner reads the page `total`, and the skill and wilaya filters show the returned facet counts

#### Scenario: Filters and sort rebuild the query

- **WHEN** the visitor sets `q`, a skill filter, a wilaya filter, `minExperiences`, `hasAvailability`, or `portfolio`, or changes `sort`
- **THEN** the request carries only the set filters plus the whitelisted `sort`, and the result set and totals refetch

#### Scenario: Unknown sort is rejected before the request

- **WHEN** a `sort` value outside `newest | oldest | experiences_desc` is supplied
- **THEN** no request is sent and the UI reports the neutral invalid-filter message

#### Scenario: Cursor paging walks the full result set

- **WHEN** more results exist than the current page
- **THEN** next advances the opaque `cursor` and previous restores the prior cursor, and the count banner tracks the new `total`

#### Scenario: Empty result set renders a neutral empty state

- **WHEN** a filter combination matches no talents
- **THEN** the grid renders its neutral empty message with no cards and no invented placeholder rows

### Requirement: Talent cards render only publicly projected fields

Each card SHALL render exclusively from the public talent projection: the raw `username` as the card's link target (no `@` prefix, linking to `/volunteers/{username}`), the display name built from `firstName` only with `username` as the fallback (never the surname), `bio`, `location.wilayaId`, the `skills` list, the `avatar` resolved through `GET /media/:mediaId` when present, the `stats` block only when the payload supplies it, and the `favoriteCount` with its save state.

The card SHALL NOT render a per-card availability badge, experience count, portfolio count, headline, or member-since line, because the public talents projection does not supply them; availability is expressible only as the `hasAvailability` request filter, never as a per-card claim. The card SHALL NOT render messaging, contact, or invite affordances.

#### Scenario: Card shows the projected fields only

- **WHEN** a talent card's payload carries `username`, `firstName`, `bio`, `location.wilayaId`, `skills`, `stats`, `favoriteCount`, and `isFavorited`
- **THEN** the card shows those fields and links to `/volunteers/{username}`, and no availability badge, experience count, portfolio count, or contact control appears

#### Scenario: Missing optional fields degrade without breaking the card

- **WHEN** a talent's payload omits `bio`, `location`, `skills`, `stats`, and `avatar`
- **THEN** the card still renders its name and link, the omitted fields leave no placeholder or empty box, and the grid stays aligned

#### Scenario: Opted-out fields never surface on a card

- **WHEN** a talent has `showStats` or `showBiography` off, so the payload returns `stats: null` or `firstName`/`bio` as `null`
- **THEN** the card omits the stats strip and the biography respectively, falling back to `username` for the name, and renders no count or placeholder

### Requirement: Directory save state and guest redirect

Each card SHALL expose a save control whose state reflects the card's `isFavorited` and whose label carries `favoriteCount`. For a guest, activating save SHALL navigate to Login with a `next` parameter pointing back at the current directory URL including its active query string, and SHALL send no mutation. For an authenticated volunteer, save SHALL toggle through the existing favorites capability and the card state SHALL reconcile with the server response, rolling back on failure. The favorites capability is consumed read-only from its owning hook file and SHALL NOT be re-implemented or edited by this route.

#### Scenario: Guest save on a card redirects to Login

- **WHEN** a guest activates save on a talent card
- **THEN** the browser navigates to `/{locale}/login?next=<encoded directory URL with its query string>` and no favorite request is sent

#### Scenario: Authenticated save toggles and reflects the server state

- **WHEN** an authenticated volunteer saves then unsaves a talent
- **THEN** the card's pressed state and count follow the server response, and a failure rolls the control back to its prior state with a neutral error message

#### Scenario: Card links resolve to the merged profile route

- **WHEN** a visitor follows a card's name link
- **THEN** the merged public profile at `/volunteers/{username}` renders, with no `@` in the path

### Requirement: Neutral directory surface and responsive matrix

The directory SHALL present the same neutral civic-network surface as the profile route: no civic-registry, supervisory-authority, or audit vocabulary; no ranking, leaderboard, or "top talents" ordering beyond the server-defined `sort`; and no endorsement-count or credential-count copy. The layout SHALL work at all three viewports: 3-column at 1440, 2-column at 1100, and single-column with the shared bottom navigation at 390, using logical CSS properties only so the Arabic locale mirrors correctly.

#### Scenario: No ranking or civic vocabulary in either locale

- **WHEN** the directory and its `publicTalent` catalogs are scanned in `en` and `ar`
- **THEN** no leaderboard/ranking affordance, endorsement count, or registry/authority/audit term is present, and ordering comes only from the whitelisted `sort`

#### Scenario: Viewport matrix and RTL mirroring

- **WHEN** the directory is rendered at 1440, 1100, and 390 in both `en` and `ar`
- **THEN** the grid reflows to 3, 2, and 1 columns respectively, and at `ar` the layout mirrors with logical properties and no horizontal overflow

