## Why

`2026-09-28-frontend-fix-design-fidelity` is archived (all tasks checked) and
must not be edited. Its landing pilot established the shared `PublicNavbar` /
`PublicFooter`, the token/i18n/API/responsive mandates, and the structural
fidelity harness. The Public Opportunities list screen (`(public)/opportunities`)
does not exist yet as a public route — only the authenticated
`/volunteer/opportunities` and the public `[idOrSlug]` detail do — and its
`design/...Public Opportunities/code.html` still carries the rejected Law 12-06
civic-registry narrative.

## What Changes

- Public route `(public)/opportunities` (page + client) porting `code.html` in
  DOM order with theme tokens, `publicOrgs.oppsList.*` en/ar keys, and logical
  properties; all civic-narrative copy stripped per the standing rejection.
- Data from the real backend: `GET /opportunities` (`q`, `categoryId`,
  `skillId`, `wilayaId`, `municipalityId`, `from`/`to`, `hasOpenPositions`,
  `sort`, `cursor`/`limit`) plus facets from `GET /locations/wilayas`,
  `GET /skill-categories`, `GET /skills`. No `mode` query param exists on the
  feed DTO, so the Format select filters the served page client-side on the
  real `onsite|remote|hybrid` enum. Cursor/total pagination via the Session 7
  `{ total, page, pages, nextCursor }` shape with the shared Prev/Next
  `Pagination` (numbered mockup buttons reconciled, not faked).
- Continuity: shared `PublicNavbar` (upgraded with active-state + guest /
  volunteer / org auth-state, same markup) and `PublicFooter` reused verbatim
  via the existing `(public)` layout; lucide-react icons for every slot;
  `/public/org.png` + `/public/user.jpg` fallbacks (both confirmed present).
- Fidelity gate: Playwright structural test (`file://` code.html vs built
  `/en/opportunities`, 1440x900) printing the diff table; stop after the table
  plus the before/after removal list. No push.

## Capabilities

### New Capabilities

- `public-opportunities-list`: filterable public feed with guest CTA band and
  empty states, backed by the real opportunities feed.
- `opportunities-fidelity`: per-section structural diff harness for this screen.

### Modified Capabilities

- `frontend-shell`: `PublicNavbar` gains active-state and auth-state rendering
  consumed by both landing and this screen (same component, same markup).
- `publicOrgs-messages`: new `oppsList` catalog keys (en+ar).

## Impact

- Frontend only: `src/app/[locale]/(public)/opportunities/`,
  `src/lib/api/publicOpportunities.ts`, `src/hooks/usePublicOpportunities.ts`,
  `src/components/shell/PublicNavbar.tsx`, `messages/public-orgs/`, `e2e/`.
  No backend, API, or archived-change edits. No push.
