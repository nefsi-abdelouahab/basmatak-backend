# public-opportunity-details Specification

## Purpose
TBD - created by archiving change frontend-public-orgs. Update Purpose after archive.
## Requirements
### Requirement: Public opportunity detail from embeds
The system SHALL render `(public)/opportunities/[idOrSlug]` from `GET /api/v1/opportunities/:idOrSlug` (published-only; non-published id/slug → 404 state), showing title, description, category, mode, `endDate`/`durationMinutes` (neutral duration wording, never "Accredited Hours"), prerequisites, deliverables, cover gallery from real `coverMediaId`, and `OPP-<registryId>` display-only (never a route key) — Law pills, registry-code strips, gazette tags, insurance/statutory cards, and dispatch strips SHALL NOT render.

#### Scenario: Detail renders embed-driven meta
- **WHEN** a guest opens a published `(public)/opportunities/[idOrSlug]`
- **THEN** the system requests `GET /api/v1/opportunities/:idOrSlug` and renders the meta boxes from real fields with `OPP-<registryId>` and neutral duration copy.

#### Scenario: Non-published slug renders 404
- **WHEN** `GET /api/v1/opportunities/:idOrSlug` returns 404
- **THEN** the shared not-found state renders with no detail residue.

### Requirement: Positions with counts and assigned names
The system SHALL render opportunity positions with `requiredCount`/`filledCount`, public `applicationCount`, assigned volunteer names, and skill names — counts and names come from the detail payload only (no extra per-position fetch).

#### Scenario: Positions show counts plus assignees
- **WHEN** the detail loads with positions fixtures
- **THEN** each position shows required/filled counts, `applicationCount`, and assigned names from the single detail response.

### Requirement: Neutral publisher card
The system SHALL render the publisher card from the detail org embed (org name, slug-linked profile link, logo, verification status as neutral "Verified organization", `ORG-<registryId>` display-only, neutral registration facts, org-aggregate hours where served) — registration-number civic copy, wilaya-register lines, civic-history totals, authority/audit vocabulary, and statutory/insurance/logistics blocks SHALL NOT render.

#### Scenario: Publisher card links to public org profile
- **WHEN** the detail renders with an org embed carrying a slug
- **THEN** the publisher card links to `(public)/orgs/[slug]` and carries no forbidden civic copy.

#### Scenario: Missing embed renders neutral fallback
- **WHEN** the detail payload carries no org embed
- **THEN** a neutral fallback renders with no invented org facts.

### Requirement: Related opportunities via embedded slug
The system SHALL render related opportunities on `(public)/opportunities/[idOrSlug]` via the embedded org slug (`GET /api/v1/organizations/:slug/opportunities`, published-only unless the public archive covers it, small page), with each related card linking by its own id-or-slug — the related-link builder SHALL derive the slug from the embed.

#### Scenario: Related list resolves through embed slug
- **WHEN** the detail loads with an org embed slug
- **THEN** the system requests the org opportunities read and renders related cards linking to their own `(public)/opportunities/[idOrSlug]` routes.

### Requirement: Guest Apply and Save redirect to Login
The system SHALL redirect guest Apply (per position, `POST /opportunities/:opportunityId/positions/:positionId/applications`) and Save attempts on `(public)/opportunities/[idOrSlug]` to Login via `getLoginHref(locale, next)` preserving the detail URL (decision 10); no guest mutation SHALL be attempted, and deadline/seat gating SHALL disable Apply with neutral copy.

#### Scenario: Guest apply redirects with next
- **WHEN** a guest clicks Apply on a position
- **THEN** no application request is sent and the browser navigates to the Login URL carrying the detail URL as `next`.

#### Scenario: Full or past-deadline position disables Apply
- **WHEN** a position is full or its `applicationDeadline` has passed
- **THEN** Apply renders disabled with neutral copy and no request is sent.

### Requirement: Opportunity details mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `(public)/opportunities/[idOrSlug]` (theme tokens only; `publicOrgs.*` strings en+ar with RTL logical properties; data only via `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts` over the F0 axios client; responsive at 1440/1100/390), handle loading/empty/error plus 401/403/404/429/503 via the F0 error mapping, and SHALL NOT render perks/logistics inputs, messaging, ranking, attestation, or org-side editing affordances.

#### Scenario: Guards exclude out-of-scope affordances
- **WHEN** the public opportunity detail renders
- **THEN** no perks/logistics input, message-thread, attestation-download (without an experience), or opportunity-edit affordance exists in the DOM.

