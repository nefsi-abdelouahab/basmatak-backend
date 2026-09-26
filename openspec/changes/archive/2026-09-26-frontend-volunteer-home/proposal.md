## Why

Volunteers have no home surface: delta doc V2 §B#1/#2/#4 confirms Dashboard, Opportunities feed, and Discover Talents are backed by real v2 feeds (dashboard payload, `mode`/`durationMinutes`/`sort`/`nearMe`/`total`, talents facets, favorites toggles) but no frontend routes consume them yet. Without this change, volunteers cannot see stats, browse opportunities, discover talents, or save favorites.

## What Changes

- New route `volunteer/dashboard`: stat cards from `GET /volunteers/me/dashboard`, latest-verified-experience block, hours derived from `durationMinutes`.
- New route `volunteer/opportunities`: filterable feed from `GET /opportunities` + `GET /opportunities/recommended` with `q`/`sort`/`page`, multi-value filters, `nearMe`, week/weekend windows; result-count banners from `total`; cards show org name + verified badge + `OPP-<registryId>` from embeds (no N+1); guest Save redirects to Login.
- New route `volunteer/talents`: discover feed from `GET /talents` with `minExperiences`/`hasAvailability`/`portfolio`/`skillIds[]`/`wilayaIds[]`/`sort`, facet counts, totals; contact/invite stays absent (no messaging).
- New API modules `lib/api/feed.ts` (feed, recommended, talents + facets, lookups) + `lib/api/favorites.ts` (toggles, counts, `lookup`); hooks `hooks/useFeed.ts` + `hooks/useFavorites.ts`; catalogs `messages/volunteer-home/{en,ar}.json` under the `volunteerHome` prefix.
- Out of scope: details/apply (F5), tasks/activity (F6).

## Capabilities

### New Capabilities
- `volunteer-dashboard`: dashboard stats cards, latest-verified-experience, completion readout.
- `opportunity-feed`: opportunities + recommended feed, filters/sort/pagination, count banners, org embeds, save toggles.
- `talent-discovery`: talents feed, filters/facets/sort, totals, save toggles.
- `volunteer-favorites`: favorite toggles/counts/lookup, guest-to-login redirect.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 3 route dirs, 2 api modules, 2 hook files, 1 message prefix. Consumes F0 theme/i18n/api-client/primitives and F1 `auth` session state read-only (no edits to archived files).
- FC file-disjointness holds: `feed.ts`/`useFeed.ts` + `favorites.ts`/`useFavorites.ts` are untouched by F5 (`opportunity.ts`/`useOpportunity.ts`), F6 (`tasks.ts`/`useTasks.ts`), F7 (`submissions.ts`/`useSubmissions.ts`), F8 (`experiences.ts`/`useExperiences.ts`).
