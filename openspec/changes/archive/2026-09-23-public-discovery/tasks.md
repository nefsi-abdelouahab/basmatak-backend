## 1. Talents feed

- [x] 1.1 Create `backend/src/volunteers/dto/talents.dto.ts`: `TalentsQueryDto` with `q` (string, max 120), `skillId` (MongoId), `categoryId` (MongoId), `wilayaId` (string, max 40), `cursor`, `limit` — class-validator, whitelist + forbidNonWhitelisted per the global pipe
- [x] 1.2 Implement `VolunteersService.listPublicTalents(query)` (replacing the inert stub): base filter `{ 'publicProfile.enabled': true }`; `wilayaId` filter; `skillId`/`categoryId` resolved via `volunteer_skills` + catalog `skills` probes into a `userId` `$in`; `q` as a bounded, regex-escaped case-insensitive `$or` over `username`/`firstName`/`lastName`/`bio`; newest-first cursor pagination via the S1 util (default 20, max 50)
- [x] 1.3 Public-safety projection mapper for talent cards: `username` always; `firstName`/`bio` under `showBiography`; `location` (wilaya) under `showLocation`; skills summaries (catalog-joined `skillId`/`nameAr`/`nameFr`/`level`/`isPrimary`) under `showSkills`; `avatar` under `showAvatar` AND `visibility=public` media only; no private fields in the mapping
- [x] 1.4 Register `@Public()` `GET /talents` in the new `PublicVolunteersController` (declared last in `VolunteersModule.controllers`, after the static `me` routes), wired to the new DTO and service method

## 2. Public profile resolver (A5)

- [x] 2.1 Populate `getPublicProfile(username)`: keep returning `null` for unknown/`enabled=false`; for enabled profiles load in parallel — skills (with catalog names) under `showSkills`, experiences (`publicVisibility=public`) under `showExperiences`, availability schedule under `showAvailability`; avatar only when `showAvatar` and its media row is `visibility=public`
- [x] 2.2 Register `@Public()` `GET /volunteers/:username` in `PublicVolunteersController` mapping `null` → `404` error envelope (`VOLUNTEER_PROFILE_NOT_FOUND`); on success return the populated `PublicVolunteerProfile`. (Separate unprefixed controller mirrors the `PublicVerificationController` precedent; static `me` routes in `VolunteersController` still win route priority.)
- [x] 2.3 Verify the route returns `404` for disabled/unknown profiles and never emits `userId`, `email`, `phone`, `birthDate`, or `stats`

## 3. Public experiences and portfolio routes

- [x] 3.1 Implement `getPublicExperiences(volunteerId, limit, cursor)`: `volunteer_experiences` newest-first cursor page over `{ volunteerId, publicVisibility: 'public' }`, snapshot fields + evidence metadata restricted to `visibility=public` media (A6, the `getPublicProof` pattern)
- [x] 3.2 Register `@Public()` `GET /volunteers/:username/experiences` in `PublicVolunteersController` — `404` when the profile is disabled/unknown; otherwise the public page; no dependence on `showExperiences`
- [x] 3.3 Register `@Public()` `GET /volunteers/:username/portfolio` in `PublicVolunteersController` — profile-404 gate, then `PortfolioQueryService.getPublicPortfolio(username)`; this change does not implement the portfolio read
- [x] 3.4 Add `MediaCollection` and `VolunteerExperiencesCollection` to `VolunteersModule`'s `MongooseModule.forFeature` (additive foreign-model reuse) so avatars/evidence resolve without touching the media/experiences modules

## 4. Recommendation engine

- [x] 4.1 Export a pure scoring function (same skills/location sources as S4): skill-topic overlap over the open positions' `requiredSkills` (+ `isPrimary` bonus), `wilayaId`-match bonus, recency tie-break via `_id`, full deterministic sort
- [x] 4.2 Implement `OpportunitiesService.getRecommended(account, limit, cursor)` replacing the S6 empty stub: load caller's profile + `volunteer_skills`, fetch candidates as `status: published` with ≥1 position `filledCount < requiredCount`, score + sort deterministically, page via the S1 cursor util (default 20, max 50); graceful degradation when the caller has no skills/location
- [x] 4.3 Confirm `GET /opportunities/recommended` stays `@Roles('volunteer')` and is still declared before `GET /opportunities/:idOrSlug` (no reordering)

## 5. Seam replacement and interface discipline

- [x] 5.1 Replace the inert `listPublicTalents`/`getPublicExperiences` bodies with the real reads from sections 1–3; keep the seam method contracts intact
- [x] 5.2 Leave `PortfolioQueryService` (S1) and the S4/S5 public-seam interfaces unchanged so S13/S14 consumers compile untouched — note: in parallel, session S14 (portfolio change) upgraded `PortfolioQueryService` into a real read with a source-compatible public interface (`PublicPortfolio`, `PortfolioItemShape`); this change consumes the upgraded seam without altering it (only a lint dead-import removal on the shared file)
- [x] 5.3 Confirm S5's organization public seams are already superseded by S6's real routes (no further action); recorded in the session summary

## 6. Unit tests

- [x] 6.1 Talents: filter combinations (`q`, `skillId`, `categoryId`, `wilayaId`) narrow correctly; `enabled=false` profiles excluded; projection respects every `show*` flag; avatar omitted when media `visibility=private`; pagination clamps limit to 50
- [x] 6.2 Recommendation: determinism (same input → identical order on two calls); skill-overlap vs location vs recency ranking; `draft`/`closed`/full positions excluded; no-skills/no-location volunteer still gets the published-open set
- [x] 6.3 Flag gating: per-section `show*` on `getPublicProfile`; `404` for disabled/unknown; A6 media filtering on profile avatar and experience evidence

## 7. E2E tests

- [x] 7.1 Create `backend/test/public-discovery.e2e-spec.ts`: seed volunteer A (enabled, skills, public experiences + one private experience), volunteer B (disabled), volunteer C (partial flags), volunteer D (skills for recommended)
- [x] 7.2 Guest scenarios: `GET /talents` returns A/C not B; `GET /volunteers/A` exposes only flagged sections; `GET /volunteers/A/experiences` returns only `publicVisibility=public` rows; `GET /volunteers/A/portfolio` returns the seam's empty shape; `GET /volunteers/B` (profile/experiences/portfolio) all `404`
- [x] 7.3 Guest 401-free: all five public routes (`/talents`, `/volunteers/:username`, `/experiences`, `/portfolio`, plus existing `/opportunities`) succeed without auth
- [x] 7.4 No leaks: guest responses contain no `userId`/`email`/`phone`/`stats`/private experience fields; private evidence media absent
- [x] 7.5 Recommended: volunteers with different skills/locations get different deterministic ordered feeds; a non-volunteer role calling the route gets `403`

## 8. Verification and wrap-up

- [x] 8.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — green for all this change's files/suites (full unit 250/250; `public-discovery` and `opportunities` e2e green; remaining failures at the time of wrap-up are confined to other in-flight sessions' untracked files: `portfolio.e2e-spec.ts` throttling/resolves issues and the S13 reviews spec, both since stabilized independently)
- [x] 8.2 From the repo root: `openspec validate public-discovery` and `openspec status --change public-discovery`
- [x] 8.3 `git add` selectively (backend vol/opp changes + `backend/test/public-discovery.e2e-spec.ts` + the change's openspec artifacts under `openspec/changes/public-discovery/**` only); never `git add -A`; commit `feat(public-discovery): talents feed, gated profiles, recommended tasks`