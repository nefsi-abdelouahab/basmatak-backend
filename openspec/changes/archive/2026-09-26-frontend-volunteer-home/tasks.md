## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/feed.ts`: `listOpportunities` (`GET /api/v1/opportunities` with `q/categoryId/skillId/wilayaId/municipalityId/from/to/hasOpenPositions/nearMe/sort/cursor/limit`), `listRecommended` (`GET /api/v1/opportunities/recommended`), `listTalents` (`GET /api/v1/talents` with `q/skillId/categoryId/wilayaId/skillIds/wilayaIds/minExperiences/hasAvailability/portfolio/sort/cursor/limit`), `getVolunteerDashboard` (`GET /api/v1/volunteers/me/dashboard`).
- [x] 1.2 Add lookups to `lib/api/feed.ts`: `listSkillCategories` (`GET /api/v1/skill-categories`), `listSkills` (`GET /api/v1/skills`), `listWilayas` (`GET /api/v1/locations/wilayas`), `listMunicipalities` (`GET /api/v1/locations/wilayas/:wilayaId/municipalities`, lazy per wilaya).
- [x] 1.3 Add `lib/api/favorites.ts`: `saveOpportunity` (`POST /api/v1/favorites/opportunities/:id`), `removeOpportunity` (`DELETE /api/v1/favorites/opportunities/:id`), `saveTalent` (`POST /api/v1/favorites/talents/:username`), `removeTalent` (`DELETE /api/v1/favorites/talents/:username`), `listOwnFavorites` (`GET /api/v1/favorites`), `countsOwn` (`GET /api/v1/favorites/counts`), `lookupFavorites` (`GET /api/v1/favorites/lookup`, guest-tolerant).
- [x] 1.4 Keys via the F0 `queryKeys` factory (`feed`, `favorites` namespaces) — no `lib/query/keys.ts` or archived-file edits.

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useFeed.ts`: dashboard query, opportunities infinite/cursor query with URL-synced filter params + week/weekend `from`/`to` derivation, recommended strip query, talents query, lazy municipality query; totals read from `CursorPage { items, nextCursor, limit, total, page, pages }`.
- [x] 2.2 Add `hooks/useFavorites.ts`: toggle mutations (optimistic flip + reconcile), `lookup` hydration per feed page, counts read, guest-guard via `getLoginHref(locale, next)` with 401 fallback (decision 10).

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/volunteer/dashboard/page.tsx`: stat cards from dashboard `stats` + `completionPercent`, `latestVerifiedExperience` block (org + date + code + `EXP-<registryId>`, null → neutral empty state); hours from `durationMinutes`.
- [x] 3.2 Add `app/[locale]/volunteer/opportunities/page.tsx`: recommended strip + main feed, filter panel (multi-selects, `nearMe=me` gated on known wilaya, week/weekend shortcuts), `sort`, pagination, `total`-sourced count banners; cards show org name + verified badge + `OPP-<registryId>` from embeds (no N+1), link to F5 detail route (no inline apply).
- [x] 3.3 Add `app/[locale]/volunteer/talents/page.tsx`: talents grid + filters/facets + `sort` + pagination + `total` banners; cards show public stats/availability/portfolio counts + Save toggle; no contact/invite UI.
- [x] 3.4 Add `messages/volunteer-home/en.json` + `ar.json` (prefix `volunteerHome.*`); wire into next-intl config; RTL logical-properties only (`ms-/me-/ps-/pe-`, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.5 Loading/empty/error states on all three routes via F0 error mapping incl. 401/403/404/429/503 with retry; guest access to dashboard redirects to Login; guest Save on either feed redirects to Login.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: filter-param builder (multi-value comma-joins, `nearMe` gating, sort whitelist passthrough), banner counts sourced from `total`/`page`/`pages` (never `items.length`).
- [x] 4.2 Unit: week/weekend `from`/`to` derivation; lookup hydration mapping (`{ favorited, favoriteCount }` per key); guest-redirect `next` targeting.
- [x] 4.3 E2E: search/filter/sort/pagination incl. empty state + clear-filters on both feeds; cards assert embed-only rendering (no per-card detail fetch, `OPP-<registryId>` visible).
- [x] 4.4 E2E: favorite toggle persists across reload on both feeds; guest favorite → login with `next` return; counts badge reads `GET /favorites/counts`.
- [x] 4.5 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (F0 grep gates).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [ ] 5.2 `openspec validate frontend-volunteer-home` + `openspec status --change frontend-volunteer-home` clean; archive only after owner go on OQ1/OQ2.
