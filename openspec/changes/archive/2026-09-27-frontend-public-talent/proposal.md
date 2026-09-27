## Why

The merged Public Talent + Volunteer Profile (V2 §B#25/§B#26, merge plan M1) is the last major public surface with no frontend at all: two design folders still describe the same screen separately, and the backend fully backs the merged result (`GET /volunteers/:username` + `/experiences` + `/portfolio` + `/reviews`, `GET /talents`). Until F17 lands, the `/volunteers/:username` link that F4's talent card already renders is a dead route, and the opt-out-gated public profile, derived contribution areas, public reviews and the public talent directory have no UI. This change executes the M1 merge on the design side and adds the public discovery entry.

## What Changes

- ADDED route `(public)/volunteers/[username]` — the single merged public profile (plan M1: Talent layout as base + the Volunteer folder's richer media grid and stats strip, which are now publicly backed). Sections: identity (avatar, `firstName`, `headline`, `bio`, `VOL-<registryId>` display-only, location; the payload's `createdAt` is deliberately not rendered, since a member-since/joined line is a registry-membership claim), stats strip (`stats.*`, showStats-gated), derived areas of contribution (≤8, sorted desc, gated by showExperiences), skills, availability (weekday slots + optional note only), verified experiences, portfolio media grid, and the neutral "Recommended by organizations" reviews list.
- ADDED route `(public)/talents` — the public talent directory over `GET /talents` (search `q`, facet filters `skillId`/`categoryId`/`wilayaId` + multi-select `skillIds`/`wilayaIds`, thresholds `minExperiences`/`hasAvailability`/`portfolio`, whitelisted `sort` (`newest | oldest | experiences_desc`), cursor paging with totals, and the returned `facets` skill/wilaya counts). Shares `usePublicTalent` with the profile route.
- ADDED `lib/api/publicTalent.ts` (one typed function per endpoint, zod-parsed), `hooks/usePublicTalent.ts` (TanStack Query only, F0 key factory, no `keys.ts` edit), and `messages/public-talent/{en,ar}.json` under the owned `publicTalent` prefix (auto-merged; `src/i18n/request.ts` untouched).
- Opt-out gating is honored by show-flag, never by client invention: each gated block renders only when its backing field is present, and a hidden block leaves no heading, placeholder, count or empty-state residue. All flags default on server-side.
- "Verify on National Ledger" is removed (no such platform route, no QR page). Verified experiences instead carry an inline "✓ Verified by [org] on [date]" line built from the experience's own `organization` embed + `verifiedAt`.
- Guest authed actions redirect to Login with `next` (decision 10 — the backend only ever 401s). Favorites are consumed read-only from the F4 hook file (never re-edited).
- No public activity feed: activity stays private per-account; the profile shows experiences + portfolio + reviews only (V2 §E#5).
- Forbidden copy is absent: no surname, no tier ("Level 2 Verified" / "Verified Contributor"), no registry-membership claim (including any "member since" line from `createdAt`), no endorsement count, no civic-registry/authority/audit vocabulary. The route key is the raw username with no `@`.
- Apply is out of scope: no apply control renders on this route — guest save/favorite redirects to Login, and applying belongs to the public opportunity details screen (F18).

## Capabilities

### New Capabilities
- `public-talent-profile`: the merged opt-out-gated public volunteer profile at `(public)/volunteers/[username]` — identity, stats strip, derived areas, skills, availability, verified experiences, portfolio media grid, public reviews, guest redirects, and the neutral verification line.
- `public-talent-discovery`: the public talent directory at `(public)/talents` — filtered/faceted/sorted cursor-paged `GET /talents` browse with totals and per-card save state.

### Modified Capabilities
<!-- None. Backend capabilities (volunteers, talent-discovery, volunteer-experiences, volunteer-portfolio, reviews, portfolio, favorites, media) are consumed read-only and never modified. No archived frontend capability's requirements change: the F4 `volunteer-home` talent card already links to `/volunteers/:username` and simply starts resolving, and the F4 favorites hook is imported unchanged. -->

## Impact

- Frontend only (its own git repo, gitignored by the parent): new route dirs `src/app/[locale]/(public)/volunteers/[username]` and `src/app/[locale]/(public)/talents`, new `src/lib/api/publicTalent.ts` (+ unit test), new `src/hooks/usePublicTalent.ts`, new `src/messages/public-talent/{en,ar}.json` (+ parity test), new `e2e/public-talent.spec.ts`. F0 theme/i18n/api-client/query-keys/blob-helper, `components/ui/*`, `useSession.ts` and `useFavorites.ts` are consumed read-only.
- Section FF is file-disjoint from F18: distinct route dirs, distinct `lib/api/publicTalent.ts` vs `publicOrgs.ts`, distinct `usePublicTalent.ts` vs `usePublicOrgs.ts`.
- Backend untouched (`/backend`, `docs/API.md`, `backend-inventory.md` unchanged) — endpoints were read read-only to pin the response shapes. Out of scope: landing page, public organization profile, public opportunity details (F18).
