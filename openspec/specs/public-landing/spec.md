# public-landing Specification

## Purpose
TBD - created by archiving change frontend-public-orgs. Update Purpose after archive.
## Requirements
### Requirement: Landing search entries
The system SHALL render landing search entries backed by `GET /api/v1/organizations` (`q`, `page`, `CursorPage` `total`) for org search and `GET /api/v1/opportunities` for opportunity search, with `GET /api/v1/skill-categories` and `GET /api/v1/locations/wilayas` lookups for category/location facets.

#### Scenario: Org search entry searches public orgs
- **WHEN** a guest submits a keyword in the landing org search
- **THEN** the system requests `GET /api/v1/organizations` with `q` and renders result links to `(public)/orgs/[slug]` with the `total` count.

#### Scenario: Empty search shows neutral empty state
- **WHEN** `GET /api/v1/organizations` returns zero items
- **THEN** a neutral empty state renders (no invented suggestions, no civic copy).

### Requirement: Published opportunity feed with embeds
The system SHALL render the landing published-opportunity feed from `GET /api/v1/opportunities` (cursor `cursor`/`limit`, `total` banner), where each card shows org name + verified badge from the org embed, category label from the category embed, `OPP-<registryId>` display-only (never a route key), and real `endDate`/`durationMinutes` (hours from durations only).

#### Scenario: Feed cards render embeds without N+1
- **WHEN** the landing feed loads
- **THEN** every card renders org name, verified badge, category label, `OPP-<registryId>`, and duration from the single `GET /api/v1/opportunities` response with no per-card fetch.

#### Scenario: Feed count banner matches total
- **WHEN** the feed page loads
- **THEN** the banner count equals the response `total`.

### Requirement: Talent sample strip
The system SHALL render the landing talent sample strip from `GET /api/v1/talents` showing only public card fields (name, bio, location, skills, avatar, public stats, `favoriteCount` + save state), with no private counts and no contact/invite affordance.

#### Scenario: Talent strip shows public fields only
- **WHEN** the landing loads with talent fixtures
- **THEN** each sample card renders the projected public fields and links onward without contact/invite controls.

### Requirement: Neutral sample record card
The system SHALL render the landing sample record card as a static neutral example with title, org, date, `EXP-<registryId>`, and "Verified" only — no "civic hours", audit-trail/logbook, ledger, Law, registry, or statutory copy.

#### Scenario: Sample card carries no civic vocabulary
- **WHEN** the landing renders
- **THEN** the sample card shows title, org, date, `EXP-<registryId>`, "Verified", and none of the forbidden civic/audit/ledger terms exist in the DOM or catalogs.

### Requirement: Guest Apply and Save redirect to Login
The system SHALL redirect guest Apply and Save attempts on the landing to Login via `getLoginHref(locale, next)` preserving the landing URL (decision 10 — backend only ever returns 401); no guest mutation SHALL be attempted.

#### Scenario: Guest apply redirects with next
- **WHEN** a guest clicks Apply on a landing card
- **THEN** no application request is sent and the browser navigates to the Login URL carrying `next`.

#### Scenario: Guest save redirects with next
- **WHEN** a guest clicks Save on a landing card
- **THEN** no favorite mutation is sent and the browser navigates to the Login URL carrying `next`.

### Requirement: Landing mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `(public)/` (theme tokens only with radii 12/8/6, type scale, shadows, borders; `publicOrgs.*` strings en+ar with RTL logical properties; data only via `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts` over the F0 axios client; responsive at 1440/1100/390), handle loading/empty/error plus 401/403/404/429/503 via the F0 error mapping, and SHALL NOT render Law 12-06, accredited, statutory, registry/authority/audit/supervisory, ledger/logbook, fabricated-code (`DZ-*`, `TC-*`, `APL-*`), mission-logistics, perks, messaging, ranking, standalone-portfolio, or verify-page copy or affordances.

#### Scenario: Guards exclude forbidden affordances
- **WHEN** the landing renders
- **THEN** no registry/authority/audit/supervisory text, logistics block, message thread, ranking, or verify-page affordance exists in the DOM.

### Requirement: Landing section order and composition
The system SHALL render the landing in `code.html` DOM order — header/nav, hero with image, philosophy 3-column, how-it-works steps, opportunities preview, neutral verification showcase, talents grid, organization CTA, trust strip, final CTA band, footer — with the same section nesting and heading levels, where hardcoded `surface-container-*`/`on-surface` classes are replaced by theme tokens, every string resolves from `publicOrgs.landing.*` (`en` + `ar`), data comes from `GET /opportunities`, `GET /organizations`, `GET /talents` via the existing typed client and Query hooks, and remote images are replaced by `public/landing/*` files or a neutral empty state.

#### Scenario: Sections render in design order
- **WHEN** a guest loads `/en`
- **THEN** the hero `h1`, philosophy `h2`, how-it-works `h2`, opportunities `h2`, showcase `h2`, talents `h2`, org CTA `h2`, trust `h2`, final CTA `h2`, and footer nodes all exist in `code.html` DOM order with no sidebar chrome.

### Requirement: Opportunity preview cards with tags
The system SHALL render opportunity preview rows from `GET /opportunities` showing title, organization name with verified badge from the org embed, category label, location and deadline text, neutral tag pills (`bg-surface-muted`, `rounded-md`, `label-sm`), seats line, and Apply plus details CTAs, where guest Apply redirects to Login with `next` and no guest mutation is attempted.

#### Scenario: Preview cards bind API data with token pills
- **WHEN** the landing feed loads with published fixtures
- **THEN** each card shows the API title, org name, `OPP-<registryId>`, real `endDate`/hours, and neutral tag pills with no saturated category colors.

### Requirement: Talent cards with avatars
The system SHALL render talent cards from `GET /talents` showing avatar image (or a neutral initial-letter block when no public avatar exists), name, location, headline, skill pills, verified-experience count, and a view-record link, with no contact or invite affordance and guest Save redirecting to Login with `next`.

#### Scenario: Talent grid shows public fields only
- **WHEN** the landing loads with talent fixtures
- **THEN** each card renders the projected public fields with avatar or neutral fallback and links onward without contact or invite controls.

### Requirement: CTA band and footer
The system SHALL render a restrained final CTA band (headline, supporting line, Explore-opportunities primary CTA plus Create-account secondary CTA) and a public footer (brand line, Platform links, For-Organizations links, neutral locale note) with no sidebar or authenticated chrome.

#### Scenario: CTA and footer close the page
- **WHEN** a guest scrolls to the end of `/en`
- **THEN** the CTA band CTAs navigate to the opportunities and create-account routes and the footer links resolve to real public routes.

