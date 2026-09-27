## Why

The last public surfaces have no frontend: delta doc V2 §B#24 (landing), §B#27 (org profile), §B#28 (opportunity details) are backend-backed (public search, embeds, aggregates, per-status archives, position counts/names, related via embedded slug) but no routes consume them. Guests cannot discover orgs/opportunities, verify an org, or open a shareable opportunity link.

## What Changes

- ADDED route `(public)/` (landing): org/opportunity search entries, published opportunity feed (org + category embeds), talent sample strip from `GET /talents`, neutral sample record card (title, org, date, `EXP-<id>`, "Verified"), guest Apply/Save controls that redirect to Login (decision 10).
- ADDED route `(public)/orgs/[slug]`: fact header (location, website, `foundedYear`, neutral contact), aggregates ribbon (active/completed counts, verified hours from durations, "Active since"/"Founded" — never "Accredited"), per-status public archive tabs (`published|completed|closed` + voluntary counts), cards with category embed + `OPP-<registryId>` + real `endDate`/`durationMinutes`, reliability as neutral "Submission response rate" (+ per-domain breakdown).
- ADDED route `(public)/opportunities/[idOrSlug]`: detail from embeds (org identity + profile link via embedded slug), `OPP-<registryId>` display-only, neutral duration/end-date meta, positions with `applicationCount` + assigned names, org publisher card (neutral `ORG-<registryId>`, no registry/authority/audit/supervisory copy), related-by-slug list, guest Apply → Login.
- ADDED `lib/api/publicOrgs.ts` (one typed fn per endpoint, zod-parsed) + `hooks/usePublicOrgs.ts` (TanStack Query only, F0 key factory) + `messages/public-orgs/{en,ar}.json` under owned `publicOrgs` prefix (auto-merge; `src/i18n/request.ts` untouched).
- Out of scope: merged talent profile + `(public)/volunteers|talents` (F17 owns `publicTalent.ts`/`usePublicTalent.ts`); mission-logistics blocks absent (FCD cut, no fields); no messaging/ranking/verify-page UI.

## Capabilities

### New Capabilities
- `public-landing`: landing page — search entries, published feed, talent strip, neutral sample card, guest redirects.
- `public-org-profile`: public org profile — facts, aggregates ribbon, per-status archive, reliability, neutral publisher card.
- `public-opportunity-details`: public opportunity details — embed-driven meta, positions with counts/names, related links, guest apply.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 3 route dirs (`app/[locale]/(public)/`, `app/[locale]/(public)/orgs/[slug]`, `app/[locale]/(public)/opportunities/[idOrSlug]`), 1 api module (`lib/api/publicOrgs.ts`), 1 hook file (`hooks/usePublicOrgs.ts`), 1 message prefix (`publicOrgs.*`). Consumes F0 theme/i18n/api-client/primitives + F4/F5 card patterns read-only (no shared or archived-file edits).
- Depends on FC + FD patterns (F17 parallel-safe: disjoint route dirs, `publicOrgs.ts` vs `publicTalent.ts`, `usePublicOrgs.ts` vs `usePublicTalent.ts`).
- Backend endpoints consumed (base `/api/v1`): `GET /organizations`, `GET /organizations/:slug`, `GET /organizations/:slug/opportunities`, `GET /organizations/:slug/reliability`, `GET /opportunities`, `GET /opportunities/:idOrSlug`, `GET /talents`, `GET /skill-categories`, `GET /locations/wilayas` (+ `GET /media/:mediaId` guest cover reads in own module per F5/F17 pattern).
