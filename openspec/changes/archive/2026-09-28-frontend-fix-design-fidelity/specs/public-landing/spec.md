## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Landing mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `(public)/` (theme tokens only with radii 12/8/6, type scale, shadows, borders; `publicOrgs.*` strings en+ar with RTL logical properties; data only via `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts` over the F0 axios client; responsive at 1440/1100/390), handle loading/empty/error plus 401/403/404/429/503 via the F0 error mapping, and SHALL NOT render Law 12-06, accredited, statutory, registry/authority/audit/supervisory, ledger/logbook, fabricated-code (`DZ-*`, `TC-*`, `APL-*`), mission-logistics, perks, messaging, ranking, standalone-portfolio, or verify-page copy or affordances.

#### Scenario: Guards exclude forbidden affordances
- **WHEN** the landing renders
- **THEN** no registry/authority/audit/supervisory text, logistics block, message thread, ranking, or verify-page affordance exists in the DOM.
