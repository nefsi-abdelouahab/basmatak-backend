## 1. Schemas and module skeleton

- [x] 1.1 Add `volunteer_profiles` schema via `createSchema` in `backend/src/volunteers/schemas/volunteer-profile.schema.ts`: unique `userId`, unique `username`, `firstName`, `lastName`, `bio`, `birthDate`, `location { wilayaId, municipalityId }`, `avatar`/`banner` (ObjectId-shaped), `stats { completedTasks, verifiedExperiences, volunteerHours }` (default 0), `publicProfile { enabled, showAvatar, showBiography, showLocation, showSkills, showExperiences, showAvailability, showPortfolio }` (all default `false`); indexes unique `userId`, unique `username`, plus `location.municipalityId` and `publicProfile.enabled`
- [x] 1.2 Add `volunteer_skills` schema via `createSchema`: `volunteerId`, `skillId`, `level` (int 1–5), `yearsOfExperience`, `isPrimary`; unique compound index `(volunteerId, skillId)`
- [x] 1.3 Add `volunteer_availability` schema via `createSchema`: unique `volunteerId`, `schedule` sub-document with a `{ from, to }` `HH:mm` slot array per weekday (monday–sunday)
- [x] 1.4 Add `VolunteersModule` in `backend/src/volunteers/` with `MongooseModule.forFeature` for the three collections and `exports: [MongooseModule, VolunteersService, ...]`; register it in `AppModule`

## 2. Registration seam (S2 `RegistrationExtrasService` override)

- [x] 2.1 Implement `VolunteerRegistrationExtrasService` in `backend/src/volunteers/volunteer-registration-extras.service.ts`: implements `RegistrationExtrasService`; for `user.role === 'volunteer'` creates the `volunteer_profiles` row (publicProfile defaults, `stats` zeros) with a `username` allocated via `slugifyText(dto.email local-part)` → `createWithUniqueSlug` (A12); for any other role delegates to `InertRegistrationExtrasService`
- [x] 2.2 In `backend/src/common/common.module.ts` override the binding `{ provide: REGISTRATION_EXTRAS_SERVICE, useClass: VolunteerRegistrationExtrasService }`; import `VolunteersModule` into `CommonModule` so the `volunteer_profiles` model token is injectable (no provider cycle); confirm `AuthModule`/`AuthService` code is untouched
- [x] 2.3 Map a duplicate `userId` profile creation (`E11000` on the unique `userId` index) to a business `409`

## 3. Profile routes: GET/PATCH `/volunteers/me`, public-settings

- [x] 3.1 Add `GET /volunteers/me` (`@Roles('volunteer')`): resolve the profile by `CurrentAccount.sub`, 404 `VOLUNTEER_PROFILE_NOT_FOUND` when absent; return profile incl. `publicProfile` and `stats`
- [x] 3.2 Add `PATCH /volunteers/me` DTO (names, `bio`, `birthDate`, `location { wilayaId, municipalityId }`, `avatar`, `banner` as `mediaId`) with `@IsMongoId()` on `avatar`/`banner` and format-only validation on wilaya/municipality codes; forbid `username`, `userId`, `stats`, `publicProfile` (whitelist); apply targeted `$set`
- [x] 3.3 Add `PATCH /volunteers/me/public-settings`: DTO accepts only `publicProfile.*` flags; `$set` exactly those sub-document fields; non-volunteer → 403

## 4. Skills CRUD

- [x] 4.1 Add `GET /volunteers/me/skills`: return the caller's own skill rows (model injected from `SkillsModule`'s exported `MongooseModule`)
- [x] 4.2 Add `POST /volunteers/me/skills`: load the `skills` row; unknown or `active:false` → business error (`SKILL_NOT_FOUND`); `E11000` on `(volunteerId, skillId)` → 409 `SKILL_ALREADY_ADDED`; when `isPrimary:true` clear the current primary (`updateMany({ volunteerId, isPrimary: true }, { isPrimary: false })`) before inserting so exactly one primary remains
- [x] 4.3 Add `PATCH /volunteers/me/skills/:skillId`: update `level`/`yearsOfExperience`/`isPrimary` scoped `{ volunteerId, _id: skillId }` preserving the one-primary rule; foreign/unknown `skillId` → 404
- [x] 4.4 Add `DELETE /volunteers/me/skills/:skillId`: remove the caller's own row

## 5. Availability GET/PUT

- [x] 5.1 Add `GET /volunteers/me/availability`: return the stored `schedule`, or an empty-but-correct weekly `schedule` shape when no row exists (200)
- [x] 5.2 Add `PUT /volunteers/me/availability`: validate the full weekly `schedule` DTO; replace whole schedule atomically via `findOneAndUpdate` upsert on `volunteerId` (`$set: { schedule }`)
- [x] 5.3 Add the availability controller + wire both routes under `/volunteers/me/availability`

## 6. Dashboard

- [x] 6.1 Implement dashboard computation in `VolunteersService`: `completionPercent` from a fixed fillable-field list (names, `bio`, `birthDate`, `location.wilayaId`, `avatar`, ≥1 skill, ≥1 availability slot), `stats` read from `volunteer_profiles.stats`, `latestVerifiedExperience` = `null`
- [x] 6.2 Add `GET /volunteers/me/dashboard` returning `{ completionPercent, stats, latestVerifiedExperience }`

## 7. Public-read seams (inert, for S12)

- [x] 7.1 Implement `getPublicProfile(username)` on `VolunteersService`: known username with `publicProfile.enabled=true` → gated inert profile shape (blank sections unless the matching `show*` flag is set); `enabled=false` or unknown → `null` (the A5 404 contract)
- [x] 7.2 Implement `listPublicTalents(filters)` and `getPublicExperiences(volunteerId)` returning empty-but-correct shapes (empty lists); export `VolunteersService` from `VolunteersModule`
- [x] 7.3 Confirm `getPublicPortfolio` service binding is untouched (still the Session 1 `PortfolioQueryService` default — no portfolio seam replacement)

## 8. Tests

- [x] 8.1 Unit tests: profile completion-% calculation; one-`isPrimary` invariant (setting a new primary clears the old); availability `PUT` replace is atomic and idempotent; `public-settings` toggle does not touch other profile fields; registration seam delegates to inert for non-volunteer roles and creates a profile (unique username) for `volunteer`; duplicate skill → 409 business code
- [x] 8.2 E2E: register a volunteer → `GET /volunteers/me` returns the profile (publicProfile default-off); `PATCH /volunteers/me` updates bio/location and rejects malformed `mediaId`; skills add / duplicate 409 / unknown-skill rejection / one-primary / update / delete; availability PUT + GET round-trip; dashboard returns zeroed stats + completion %; a `volunteer` account A cannot read/modify volunteer B's `/volunteers/me` resources (404/403 scoping); an `organization` account calling `/volunteers/me` → 403
- [x] 8.3 Run `npm run build && npm run lint && npm test && npm run test:e2e` from `/backend` until all green

## 9. Verification and commit

- [x] 9.1 From the repo root run `openspec validate volunteer-profiles` and `openspec status --change volunteer-profiles` (all artifacts done)
- [x] 9.2 Commit locally only with message `feat(volunteers): profiles, skills, availability, dashboard and privacy flags`