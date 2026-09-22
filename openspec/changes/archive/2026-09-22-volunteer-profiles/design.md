## Context

Sessions 1–3 shipped the foundation (base schema helper `createSchema`, `BusinessException` `{ statusCode, code, message, details? }`, global validation pipe `whitelist`+`forbidNonWhitelisted`+`transform`, `@Public`/`@Roles`/`CurrentAccount`, MongooseModule-for-model reuse pattern), identity (`users`/`sessions`/`verification_tokens`, real JWT strategy feeding `req.user = { sub, role, sessionId }`, and the `REGISTRATION_EXTRAS_SERVICE` seam that `AuthService#register` calls after creating the `users` row — currently bound to `InertRegistrationExtrasService`), and reference data (`locations` keyed by official codes, `skills` catalog, and the canonical slug pipeline `slugifyText` + `createWithUniqueSlug` in `src/common/slug/`). This session makes the `volunteer` role real: a profile area (`volunteer_profiles`, `volunteer_skills`, `volunteer_availability`) with all `§2.5` routes, a registration hook that now actually creates the profile row, and inert-but-contractual public-read seams for Session 12. Inventory §2.5 is the route authority; A5 (roadmap) defines `publicProfile` as `{ enabled, showAvatar, showBiography, showLocation, showSkills, showExperiences, showAvailability, showPortfolio }` with the `404 when enabled=false` contract. Files are CRLF; commands run from `/backend` on Windows PowerShell.

## Goals / Non-Goals

**Goals:**
- `volunteer_profiles`, `volunteer_skills`, `volunteer_availability` models via `createSchema` with the inventory §3 indexes (unique `userId`, unique `username`, `location.municipalityId`, `publicProfile.enabled`; unique `(volunteerId, skillId)`; unique `volunteerId`).
- All `§2.5` routes under `/api/v1/volunteers/me(...)`, `Vol`-gated (`@Roles('volunteer')` on the resolved account).
- A `VolunteerRegistrationExtrasService` overriding `REGISTRATION_EXTRAS_SERVICE` in `src/common/common.module.ts` that dispatches on `user.role`; `volunteer` → create the profile row; every other role → delegate to `InertRegistrationExtrasService` (non-volunteer behavior untouched).
- `avatar`/`banner` `mediaId` validated **only** as ObjectId format via the DTO pipe (`@IsMongoId`); no `media` model, no collection probe (F9 defers real checks to Session 8).
- Public-read seams `getPublicProfile`, `listPublicTalents`, `getPublicExperiences` with the A5 flag logic and a `404 when enabled=false` contract, returning empty-but-correct shapes now; `getPublicPortfolio` stays the Session 1 `PortfolioQueryService` default.
- Dashboard: completion % (computed), `stats` (read from the profile, zeros until S11), latest verified experience (empty/skeleton until S11).

**Non-Goals:**
- No public endpoints (`/volunteers/:username`, `/talents`, `/volunteers/:username/experiences`) — Session 12 consumes the seams.
- No media storage/ownership (S8), no stats computation (S11), no portfolio (S14), no organization provider for the registration seam (S5).
- No transactions are introduced (single-document writes only this session).
- No backfill of `volunteer_profiles` for accounts registered before this change (S17 seeds demo data fresh).

## Decisions

### D1. Module layout mirrors the `locations` pattern
`src/volunteers/` holds `schemas/volunteer-profile.schema.ts`, `schemas/volunteer-skill.schema.ts`, `schemas/volunteer-availability.schema.ts`, DTOs in `dto/`, `volunteers.service.ts` (profile + dashboard + seams), `volunteer-skills.controller.ts`, `volunteer-availability.controller.ts`, and `volunteer-registration-extras.service.ts`. `VolunteersModule` registers `MongooseModule.forFeature` for the three collections and **exports `MongooseModule`** (the same convention `LocationsModule` uses so the seed dispatcher and later sessions — S11 stats `$inc`, S12 public reads — resolve the model tokens).

### D2. `volunteer_profiles` schema and A5 default posture
Single top-level document via `createSchema`: `userId` (ObjectId, unique), `username` (string, unique; generated, never client-set), `firstName`, `lastName`, `bio`, `birthDate`, `location: { wilayaId, municipalityId }`, `avatar`/`banner` (ObjectId-shaped `mediaId`), `stats: { completedTasks: 0, verifiedExperiences: 0, volunteerHours: 0 }`, `publicProfile: { enabled: false, showAvatar: false, showBiography: false, showLocation: false, showSkills: false, showExperiences: false, showAvailability: false, showPortfolio: false }`. Indexes beyond the two uniques: `location.municipalityId`, `publicProfile.enabled` (S12's talents query filters on `publicProfile.enabled=true`). `location.wilayaId`/`municipalityId` carry the reference-data **codes** as strings and are validated for shape only (2-digit / 4-digit format, no existence check against `locations`); the roadmap session scope explicitly defers referential validation. `mediaId` values are validated as ObjectId format only, per F9. Rationale: A5 fixes the flag set and the default-off privacy posture; keeping `stats` and `publicProfile` embedded matches inventory §4 (stats live on `volunteer_profiles`).

### D3. Registration hook: override the seam provider in `CommonModule`, dispatch on role
New `VolunteerRegistrationExtrasService` (in `src/volunteers/`) implements `RegistrationExtrasService` and injects the `volunteer_profiles` model. `common.module.ts` swaps the binding to `{ provide: REGISTRATION_EXTRAS_SERVICE, useClass: VolunteerRegistrationExtrasService }`; `AuthModule`'s code is untouched. **DI wiring:** the model token is provided by `VolunteersModule` (`MongooseModule.forFeature`), so `CommonModule` imports `VolunteersModule` to make that token injectable into the provider; `VolunteersModule` never imports `CommonModule` (it uses plain imports — `BusinessException`, decorators — and does not inject `AppLogger`), so there is no provider cycle. The service dispatches: `user.role === 'volunteer'` → create the profile row; else → delegate to `InertRegistrationExtrasService`. The username base comes from the register DTO's email local-part via `slugifyText`, allocated with `createWithUniqueSlug` (A12 collision retry, `E11000`). Duplicate `userId` (a second profile for the same user) maps to a 409.

### D4. `/volunteers/me` reads and writes are token-scoped, owner-only by construction
`GET/PATCH /volunteers/me`, `public-settings`, and the skills/availability routes resolve `userId` from `req.user.sub` (`CurrentAccount`); because `/volunteers/me` is a fixed path bound to the token, no volunteer can address another's profile — the "403 for a second volunteer" e2e case is structurally satisfied, and a non-`volunteer` role hits `@Roles('volunteer')` → 403. A missing profile row (pre-S4 accounts) → 404 `VOLUNTEER_PROFILE_NOT_FOUND`. `PATCH /volunteers/me` DTO limits editable fields (names, `bio`, `birthDate`, `location`, `avatar`, `banner`); `username`, `userId`, `stats`, and `publicProfile` are excluded so `forbidNonWhitelisted` rejects any attempt. `PATCH /volunteers/me/public-settings` accepts **only** `publicProfile.*` fields (flat DTO mapping into the flags) and does a targeted `$set` on the sub-document, never touching other fields.

### D5. Skills CRUD: index-backed dedupe and the one-primary rule
`volunteer_skills` = `{ volunteerId, skillId, level (int 1–5), yearsOfExperience, isPrimary }`, unique `(volunteerId, skillId)`. `POST`:
1. Load the `skills` row from the S3 catalog (model injected from `SkillsModule`, which exports `MongooseModule`); unknown or `active:false` → business error (`SKILL_NOT_FOUND`, 404/400).
2. Insert; a duplicate-key `E11000` is translated to 409 `SKILL_ALREADY_ADDED` (no pre-check race — the index is the source of truth, same discipline as D3/S3 slug retry).
3. When `isPrimary:true`, first clear the current primary (`updateMany({ volunteerId, isPrimary: true }, { isPrimary: false })`), then write; a single active write to `volunteer_skills` at the end keeps the invariant "at most one `isPrimary` per profile" (single-document, no transaction needed).
`PATCH /volunteers/me/skills/:skillId` mutates `level`/`yearsOfExperience`/`isPrimary` scoped `{ volunteerId, _id: skillId }` (foreign `skillId` → 404). `DELETE` removes the caller's own row. `level` semantics (1–5) are a recorded assumption (inventory is silent) — flagged for product confirmation at S21.

### D6. Availability: one document, whole-schedule replace
`volunteer_availability` = `{ volunteerId (unique), schedule: { monday..sunday: [{ from, to }] } }` with 24h `HH:mm` time ranges. `PUT /volunteers/me/availability` is a replace-whole-schedule: `findOneAndUpdate({ volunteerId }, { $set: { schedule } }, { upsert: true })` — atomic single-document op, no partial merge possible. `GET` returns the stored schedule or an empty-but-correct `schedule` shape when no row exists (200). Rationale: inventory says "replace whole schedule"; an upsert keeps it idempotent.

### D7. Dashboard = computation + reads, no new collection
`GET /volunteers/me/dashboard` returns `{ completionPercent, stats, latestVerifiedExperience }`. Completion % counts the defined fillable fields present (names, `bio`, `birthDate`, `location.wilayaId`, `avatar`, ≥1 skill, ≥1 availability slot — a fixed, code-level weighting list) over the set. `stats` is read straight from `volunteer_profiles.stats` (zeros until S11 `$inc`s it). `latestVerifiedExperience` is `null` until S11 fills it (the route shape is decided now so the frontend contract is stable).

### D8. Public-read seams: contractual empty shells in the volunteers service
`VolunteersService` exposes `getPublicProfile(username): Promise<PublicVolunteerProfile | null>`, `listPublicTalents(filters): Promise<PublicTalent[]>` (empty), and `getPublicExperiences(volunteerId): Promise<PublicExperience[]>` (empty). `getPublicProfile` implements the A5 contract at the data layer: `publicProfile.enabled=false` (or unknown username) → returns `null` (Session 12 maps `null` to `404`); `enabled=true` → returns the shape with each section blanked unless its `show*` flag is set. `VolunteersModule` exports `VolunteersService` so S12 injects the same instance. `getPublicPortfolio` intentionally remains the Session 1 `PortfolioQueryService` default — this change does **not** replace the portfolio seam (S14 does).

## Risks / Trade-offs

- [Registration is non-transactional across `users` + profile (S2 orders `users` first, then the seam)] → Mitigation: accepted; a seam failure aborts the register route before tokens are issued, leaving a possible orphan `users` row only if the process dies mid-call — acceptable on the single-instance MVP and unchanged from S2's seam contract.
- [`mediaId` accepted on format only → a profile can reference non-existent media until S8] → Mitigation: F9 documents this exact deferral; S8 retrofits `MediaOwnership.assertFor` on `PATCH /volunteers/me`; the DTO-level `@IsMongoId` already blocks malformed values.
- [Pre-S4 volunteer accounts have no profile → `/volunteers/me` 404s for them] → Mitigation: accepted in dev (S17 seeds fresh demo accounts); documented in the migration plan.
- [`level` representation is not pinned by the inventory] → Mitigation: recorded assumption `level` = int 1–5; product-confirmed at S21 (data shape only, no schema drift).
- [Username collisions on registration] → Mitigation: `createWithUniqueSlug` retry loop + unique `username` index make allocation race-free (proven in S3).

## Migration Plan

No data migration — three new collections. The registration hook affects only **new** registrations; existing rows are untouched. Dev DBs should reseed (S17) or manually create profiles for test volunteers. Rollback = revert this session's commit (S5/S7+ read these tables but the roadmap runs sessions strictly in order). No new env vars or packages.

## Open Questions

- None blocking. (a) `level` int range pending product confirmation (S21). (b) Whether a completed profile should require more than the core fields — current weighting is a fixed list, cheap to extend.