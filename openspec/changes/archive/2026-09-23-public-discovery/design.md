## Context

Sessions 1–11 built the private side: `volunteer_profiles`/`volunteer_skills`/`volunteer_availability` with A5 `publicProfile` flags (S4), the `PortfolioQueryService` seam (S1) and `getPublicProfile`/`listPublicTalents`/`getPublicExperiences` inert seams (S4), published opportunities with embedded positions (S6), and `volunteer_experiences` with `publicVisibility` + the public `/verify/:code` proof (S11). Inventory §2.6 owns the guest surface this session fills; A6 fixes that all public reads expose only `visibility=public` media. Two things remain stubs: `VolunteersService.listPublicTalents` returns `[]`, `getPublicExperiences` returns `[]`, and `OpportunitiesService.getRecommended` returns `[]` (S6 seam). This session wires real reads behind the existing seams and adds the §2.6 routes, all guest-safe. Files are CRLF; commands run from `/backend` on Windows PowerShell; no new packages or env vars.

## Goals / Non-Goals

**Goals:**
- `GET /talents` — guest feed over `volunteer_profiles` with `publicProfile.enabled=true`, filters `q, skillId, categoryId, wilayaId`, S1 cursor pagination, public-safety projection only.
- `GET /volunteers/:username` — A5 contract: `404` when `enabled=false`/unknown; sections gated by `show*` flags, populated from live `volunteer_skills` (joined to the catalog), `volunteer_experiences` (`publicVisibility=public`), and `volunteer_availability`.
- `GET /volunteers/:username/experiences` — `404` on disabled/unknown; only `publicVisibility=public` rows, paged; evidence metadata restricted to `visibility=public` media.
- `GET /volunteers/:username/portfolio` — `404` on disabled/unknown; payload from the unchanged S1 `PortfolioQueryService` (empty until S14).
- `GET /opportunities/recommended` — real rule-based engine replacing the S6 empty seam: skills/location overlap + `published` + open positions, deterministic scoring, cursor-paginated.
- Wire the A5 flags into retrieval; ensure no route here returns another volunteer's private fields; respect A6 media visibility everywhere.

**Non-Goals:**
- No search/matching ML, no social/contact/hire endpoints for guests, no portfolio module (S14).
- The `PortfolioQueryService` binding is NOT replaced and its interface stays source-compatible for S13/S14 consumers.
- No new collections, packages, env vars, or writes — every endpoint here reads only.
- No changes to S11's `/verify/:code` or `/experiences/me` behavior.

## Decisions

### D1. Public routes live in the volunteers module; static-before-param ordering
`GET /talents` and the three `GET /volunteers/:username[...]` routes are added to `VolunteersController` (they are the §2.6 owner), each `@Public()` so guests pass with no JWT. All existing `me`/`me/...` routes are declared **before** the `@Get(':username')` handlers in the same controller, so Nest's within-controller declaration order resolves the static `me` routes first and `:username` only as a catch-all for anything else (the same trap S6 documented for `recommended` vs `:idOrSlug`). A brand-new controller would re-open that ordering trap across controllers and add a second `@Controller('volunteers')` on search; a single controller keeps it deterministic.

### D2. Talents query and public-safety projection
Base filter `{ 'publicProfile.enabled': true }` (index-backed). Additional filters:
- `wilayaId` → `{ 'location.wilayaId': wilayaId }`.
- `skillId` → one `volunteer_skills` probe (`{ skillId }`) → restrict to matching `userId`s via `$in`.
- `categoryId` → resolve the catalog `skills` with that `categoryId` → their `skillId`s → `volunteer_skills` probe → `userId` `$in`.
- `q` → capped-length, regex-escaped `$or` over `username`/`firstName`/`lastName`/`bio` (case-insensitive). No text index exists on `volunteer_profiles`; F11-style "filter bound, not a text index" reasoning applies — a plain bounded regex on the enabled set is fine at MVP scale.
Pagination: `_id`-descending cursor page via the S1 util (`normalizeLimit`, encode/decode cursor). The talent card is built by mapping each profile through the same `show*` logic the profile page uses: `firstName`/`bio` under `showBiography`, `location` (wilaya only) under `showLocation`, `skills` under `showSkills` (catalog-joined summary), `avatar` under `showAvatar` **and** `visibility=public` media (D5). Private fields are structurally absent from the mapper.

### D3. Public profile resolver: A5 gating over live data
`VolunteersService.getPublicProfile(username)` keeps its A5 contract (returns `null` for unknown/disabled → controller maps to `404` with the existing `VOLUNTEER_PROFILE_NOT_FOUND` envelope) but now populates flagged sections in parallel, all keyed off the resolved profile's `userId`:
- skills (`showSkills`): `volunteer_skills` for the user + catalog join → `[{ skillId, nameAr, nameFr, level, isPrimary }]`.
- experiences (`showExperiences`): `volunteer_experiences` `{ volunteerId, publicVisibility: 'public' }` → snapshot cards (title/description/duration/skills) — same construction the experiences route uses, minus pagination.
- availability (`showAvailability`): the `volunteer_availability` schedule (or the empty-but-correct schedule shape).
- avatar (`showAvatar`): only when the media row is `visibility=public` (D5).
`PublicVolunteerProfile` shape is unchanged apart from populated arrays, so S13/S14 consumers of the seam (if any) are unaffected.

### D4. Experiences and portfolio routes
- `GET /volunteers/:username/experiences`: resolve profile (enabled, else `404`), then page `volunteer_experiences` newest-first with `limit`/`cursor` (S1 util) over `{ volunteerId, publicVisibility: 'public' }`. For each page, collect the union of `evidenceIds` and load only `media` rows with `{ _id: { $in ... }, visibility: 'public', deletedAt: { $exists: false } }` (D5), mapping `url` only for `type=link` — the exact evidence pattern `ExperiencesService.getPublicProof` already uses (A6). This listing does not consult `showExperiences`; per §2.6 the flag governs the profile page section only.
- `GET /volunteers/:username/portfolio`: the same profile-404 gate, then return `PortfolioQueryService.getPublicPortfolio(username)` verbatim (inert `{ items: [] }`). The seam is injected from CommonModule and is **not** swapped here.

### D5. Media visibility is enforced per public read (A6)
Guests can never see non-public media. Rather than `MediaService.read` (auth-scoped), public reads query the `media` collection directly with `{ visibility: 'public', deletedAt: { $exists: false } }`, following the `getPublicProof` precedent. The volunteers module re-registers the `MediaCollection` and `VolunteerExperiencesCollection` models via `MongooseModule.forFeature` (additive; the same foreign-model reuse pattern S11 uses), so `VolunteersService` can resolve avatars and experience evidence without touching the media/experiences modules.

### D6. Recommended engine: deterministic plain-query scoring
`OpportunitiesService.getRecommended(account, limit, cursor)` replaces the empty stub:
1. Load the caller's `volunteer_profiles` (for `location`) and `volunteer_skills` (for the skill set); a missing profile behaves as having no skills/location (no `404` — the feed still returns candidates, see scenario).
2. Fetch `opportunities` with `status: 'published'` and keep those with ≥1 position where `filledCount < requiredCount` (embedded positions; MVP-scale set, filtered in code like the S6 `hasOpenPositions` path).
3. Score each candidate with a pure function of (opportunity, volunteerSkills, wilaya):
   - **skill overlap**: count of the volunteer's `skillId`s appearing in the union of the open positions' `requiredSkills`; add a small bonus when the matched skill is `isPrimary`.
   - **location**: fixed bonus when `opportunity.location.wilayaId === volunteer.location?.wilayaId`.
   - **recency**: newer opportunities tie-break higher (via `_id`).
4. Sort `score desc → _id desc` (fully deterministic — two identical inputs produce identical order), then page in memory with the S1 cursor convention (default 20, max 50).
No ML, no aggregation pipeline, no new index (the `(status, startDate)` index covers the status scan). Scoring lives as an exported pure function for direct unit tests (determinism).

### D7. Route-order and shadowing safety
`GET /opportunities/recommended` already precedes `GET /opportunities/:idOrSlug` in `OpportunitiesController` (S6). This session only fills in the handler body — no reordering. The volunteers public routes follow D1 ordering. The `/verify/:verificationCode`, `/talents`, and `/volunteers/:username` route namespaces do not collide.

## Risks / Trade-offs

- [Multiple sequential queries per public read (talents join, profile sections, media filter)] → Mitigation: acceptable at MVP scale (512 MB Atlas, demo data); queries are index-backed where §3 indexes exist; the roadmap reserves the S19 explain()/index pass.
- [In-memory scoring+paging of recommended candidates] → Mitigation: bounded by the number of published open opportunities; far below MAX_LIMIT-of-50 concerns; determinism is unit-tested.
- [`q` regex over the enabled set is not index-matched] → Mitigation: F11 records the same trade-off for the opportunities feed; cap the search term length and escape the regex so it stays cheap at MVP scale.
- [`showExperiences` does not gate the standalone experiments listing] → Mitigation: inventory §2.6 ties the flag to the profile page section only; recorded as an Open Question for product sign-off rather than silently changing both.
- [GetPublicProfile now issues several queries; S13/S14 consumers see populated sections earlier than they expected] → Mitigation: sections were specced as `show*`-gated in S4; this session only fills the data, the shape contract is unchanged.

## Migration Plan

Read-only change: no data migration, no schema or env changes, no new collections. Rollback = revert this session's commit; the inert seams and the S6 empty stub are restored by re-applying the previous state. The `PortfolioQueryService` seam stays inert, so S14's swap-in is unaffected.

## Open Questions

- Should `GET /volunteers/:username/experiences` also honour `showExperiences`? Current decision: no (inventory §2.6 governs the flag's scope to the profile page section); flagged for product confirmation.
- Talents `q` matching field set is a recorded assumption (`username`, `firstName`, `lastName`, `bio`); the inventory does not pin it.
- Recommended score weights are a fixed code-level table; they are not user-configurable (no env/settings), matching the "plain query" constraint.