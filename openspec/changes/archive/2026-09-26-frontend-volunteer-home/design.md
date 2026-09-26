## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, axios client with 401 refresh-and-retry, TanStack Query + key factory (`src/lib/query/keys.ts`), `components/ui/*` primitives, and the auth session hook (`useSession`). FB (F1/F2/F3, all archived) shipped auth routes, `volunteer/profile|settings`, and `org/complete-profile|verification-dossier` with `lib/api/{auth,volunteers,users,notifications,organizations,media}.ts`. F4 builds the three volunteer home routes (delta doc V2 §B#1/#2/#4) on those primitives. Backend route truth re-verified in `backend/src`: `GET /opportunities`, `GET /opportunities/recommended`, `GET /talents` (+ `TalentsQueryDto` multi-selects), `GET /volunteers/me/dashboard` (`{ completionPercent, stats, latestVerifiedExperience }`), `POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username`, `GET /favorites|/counts|/lookup` (lookup guest-tolerant), plus `skill-categories`/`skills`/`wilayas` lookups all exist. Design source: `design/"Volunteer Dashboard"`, `"Opportunities"`, `"Discover Talents"` folders (`code.html` + `DESIGN.md` + `screen.png`) under system tokens (violet `#6D28D9`, no new visual language).

## Goals / Non-Goals

**Goals:**
- Three token-driven, en+ar, RTL-correct routes (`volunteer/dashboard`, `volunteer/opportunities`, `volunteer/talents`) at 1440/1100/390.
- One typed api function per consumed endpoint across exactly two new api modules; all data via exactly two new hook files; unit + e2e coverage per roadmap §F4 Tests.
- Cards render org embeds + `OPP-<registryId>` with zero N+1; hours from `durationMinutes`; banners from `total`; guest Save → Login.

**Non-Goals:**
- Opportunity details/apply/withdraw/report/related (F5), applications/participations/activity (F6), any `/backend`, `docs/API.md`, `backend-inventory.md`, or archived-change edits.

## Decisions

- **Two hook files as roadmap mandates (`useFeed.ts` + `useFavorites.ts`).** Feed reads (dashboard, opportunities, recommended, talents, lookups) live in `useFeed.ts`; save-state (toggles, counts, lookup hydration, guest redirect) lives in `useFavorites.ts`. Alternative (one file) rejected — favorites logic is reused by both feeds and mirrors F5–F8 one-file-per-session parallelism; no archived file is edited.
- **`lib/api/feed.ts` owns all reads; `lib/api/favorites.ts` owns all saves.** Feed module wraps the 8 read endpoints + 4 lookups; favorites module wraps the 7 save endpoints. Alternative (per-route api files) rejected — roadmap assigns exactly these two files and FC disjointness (`useOpportunity.ts`/`useTasks.ts`/`useSubmissions.ts`/`useExperiences.ts` stay untouched).
- **Embeds-only cards, display-only registry ids.** Org name + verified badge + `OPP-<registryId>` come from the list-payload embed; `registryId` never becomes a route key (F5 detail uses `idOrSlug`). Alternative (per-card detail fetch) rejected — N+1 banned by acceptance.
- **Filter state in URL search params; cursor paging underneath.** `q`/`sort`/multi-selects/`nearMe`/week-windows serialize to the URL (shareable, reload-stable); week/weekend shortcuts derive client-side `from`/`to`. `total`/`page`/`pages` render banners/pagination. Alternative (local-state-only filters) rejected — shareability is implicit in feed UX and e2e asserts reload persistence.
- **Guest Save → Login via `getLoginHref(locale, next)`.** Mutations check session first; any 401 falls through to the F0 handler. Alternative (backend-rendered login) rejected — decision 10, backend only 401s.
- **Message prefix `volunteerHome.*` owned solely by F4** (`messages/volunteer-home/{en,ar}.json`); F5–F8 use their own prefixes — catalog merge stays collision-free.

## Risks / Trade-offs

- [Risk] Dashboard `stats` shape drifts from design stat cards → Mitigation: cards bind 1:1 to returned `stats` keys + `completionPercent`; unknown keys render generically, never invented.
- [Risk] `nearMe=me` without a volunteer wilaya returns unscoped results → Mitigation: hook sends `nearMe` only when the profile wilaya is known; otherwise the filter chip disables with helper copy.
- [Risk] F5 detail route (`volunteer/opportunities/[idOrSlug]`) link contract changes → Mitigation: cards link by `idOrSlug`/`slug` from the embed only; F5 owns the route, F4 never creates it.
- [Trade-off] Lookup (`GET /favorites/lookup`) per feed page adds one request per page → accepted; it replaces N per-card requests.

## Migration Plan

None (new routes only). Rollback = revert the single F4 commit. Archive via `openspec archive frontend-volunteer-home -y` after green verification.

## Open Questions

- **OQ1 (STOP):** Exact dashboard stat-card set and order are design-folder-driven — confirm cards bind to backend `stats` keys as returned (no invented totals) vs. a fixed design set if keys differ.
- **OQ2 (STOP):** Week/weekend window definitions (Sun–Sat vs Mon–Sun; weekend = Fri–Sat in ar-DZ locale?) — proposed ISO week Mon–Sun, weekend Sat–Sun; owner confirm before Phase 2.
- **OQ3 (non-blocking):** Recommended-strip placement on `volunteer/opportunities` (above vs below filters) — proposed above the main feed for authed volunteers, empty-state hidden; confirm at review.
