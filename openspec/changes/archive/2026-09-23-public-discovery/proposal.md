## Why

The last P1 gap: volunteers and opportunities are not yet discoverable. A guest cannot browse volunteers, and a volunteer has no personalized feed (`GET /opportunities/recommended` still returns the S6 empty stub while the S4 public-read seams return empty shapes). This change ships the four §2.6 guest routes, the rule-based recommended feed, and replaces the inert seams with real reads — completing the "guest can read everything public, nothing private leaks" baseline.

## What Changes

- Add `GET /talents` (Public): volunteer_profiles with `publicProfile.enabled=true`, filters `q, skillId, categoryId, wilayaId`, cursor-paginated, public-safety projection where each shown field honours its `show*` flag and avatar is exposed only when the media row is `visibility=public`.
- Add `GET /volunteers/:username` (Public): `404` when `enabled=false` or unknown; each profile section gated by its `show*` flag; skills/experiences/availability populated from live data; avatar honours media visibility.
- Add `GET /volunteers/:username/experiences` (Public): only `publicVisibility=true` rows; `404` for disabled/unknown profiles.
- Add `GET /volunteers/:username/portfolio` (Public): served by the **unchanged** Session 1 `PortfolioQueryService` seam (empty until S14) — never replaced here.
- Replace the S6 empty `GET /opportunities/recommended` (Vol) with a rule-based engine: overlap of volunteer skill topics/levels + location match + `published` + open positions, cursor-paginated and deterministic (no ML).
- Replace the S4 inert `listPublicTalents`/`getPublicExperiences` reads with real logic; keep seam interfaces intact so S13/S14 consumption is unchanged.
- No new packages or env vars. All public reads stay 401-free; no volunteer's private fields are ever exposed.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `volunteers`: adds the §2.6 guest surface — talents feed, public profile page, public experiences, public portfolio routes.
- `opportunities`: recommended feed evolves from the empty seam to the real rule-based implementation.
- `extension-seams`: volunteer public-read seams ship real data; the portfolio seam is explicitly kept inert.

## Impact

- Backend: `volunteers` controller gains public routes and a `@Public()` talents feed; `VolunteersService` public reads become real; `OpportunitiesService.getRecommended` becomes the rule engine. Existing `GET /opportunities/recommended` route-ordering (before `/:idOrSlug`) is preserved.
- Collections read (guest-safe): `volunteer_profiles`, `volunteer_skills`, `skills`, `volunteer_experiences`, `volunteer_availability`, `opportunities`, `media` (visibility filter only).
- Changed call sites: `volunteers.service.spec.ts` inert assertions, `opportunities.service` recommended stub, volunteer public-seam consumers.
- Tests: unit (talent filter combinations, recommendation scoring determinism, per-section flag gating) and E2E (volunteer A enabled vs B disabled/partial, 401-free guest reads, private data never leaks, recommended feed differs per volunteer).