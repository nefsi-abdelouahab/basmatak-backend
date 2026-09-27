## ADDED Requirements

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
The system SHALL satisfy the 4 mandates on `(public)/` (theme tokens only; `publicOrgs.*` strings en+ar with RTL logical properties; data only via `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts` over the F0 axios client; responsive at 1440/1100/390), handle loading/empty/error plus 401/403/404/429/503 via the F0 error mapping, and SHALL NOT render registry/authority/audit/supervisory copy, mission-logistics blocks, perks inputs, messaging, ranking, standalone-portfolio, or verify-page affordances.

#### Scenario: Guards exclude forbidden affordances
- **WHEN** the landing renders
- **THEN** no registry/authority/audit/supervisory text, logistics block, message thread, ranking, or verify-page affordance exists in the DOM.
