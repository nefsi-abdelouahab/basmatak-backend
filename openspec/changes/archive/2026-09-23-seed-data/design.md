## Context

Basmatak ships NestJS 10 + Mongoose 8 on a free-tier single instance. Sessions 1–16 built the core loop, admin/moderation (S15/S16), and trust layer; the app has no runnable prod/dev bootstrap yet: locations/skills seeds are reduced (S3), there is no admin seed (F14), and no verified demo organization exists for manual QA (F1). Session 17 plants the canonical reference data and account bootstrap, unblocking Session 18's end-to-end core-loop test and deploys (S20).

## Goals / Non-Goals

**Goals:**
- One canonical, complete location dataset (58 wilayas + all municipalities) and the full A4 skill catalog with starter skills, re-runnable idempotently.
- `seed:admin` that creates (never clobbers) an `admin` user from env, and `seed:demo` that creates exactly one verified demo organization and one demo volunteer.
- `seed:all` orchestrates all four seeds; unit + e2e tests prove idempotency and the F1 regression (admin can log in, verified org can publish).

**Non-Goals:**
- Any E2E beyond the smoke described here (S18 owns the full core-loop spec).
- Deployment (S20), docs (S21), performance/security work (S19).
- New collections, new env vars, new public/private routes, or schema migrations.

## Decisions

**D1 — locations.ts is the single source of truth.** The S3 file already holds the full bilingual dataset (58 wilayas, 1,541 municipalities with ONS codes). This session fixes the wilaya-30 entry (was "Touggourt"; must be "Ouargla", since Touggourt is code 55) so codes 01–58 are all distinct and correct, and keeps the source-date header. `LOCATION_SEEDS` remains a flat array of wilaya+municipality entries with `code` as the unique upsert key (`bulkWrite updateOne`, `upsert: true`).

**D2 — skills.ts matches A4 exactly.** The 28 categories (slug + order) already exist with `nameAr`/`nameFr`; each keeps `>= 3` starter skills. `active` is `$setOnInsert` so deactivated admin entries are never re-activated by a re-seed (deactivate-not-delete). No consumer schema changes.

**D3 — seed scripts reuse the real AppModule wiring and service paths.** Like `scripts/seed.ts`, admin/demo seeds boot `NestFactory.createApplicationContext(AppModule)`. `seed:admin` uses `UsersService.create({ role: 'admin' })` (the S2 service-level admin-capable path). `seed:demo` registers the org through the same `AuthService.register('organization')` + verification-document + `AdminOrganizationsService.approve` path S15 uses (a real pending `organization_verifications` row is created then approved), and the volunteer through `register('volunteer')` + `VolunteersService.addSkill` — no orphan field writes anywhere. Idempotency comes from stable emails/slugs (`createWithUniqueSlug`), checking existence before re-creating.

**D4 — password safety.** `seed:admin` computes the desired bcrypt hash but only writes `passwordHash` when the user does not exist, or when `SEED_ADMIN_RESET=true`. Existing admins keep their current password across re-seeds.

**D5 — one dispatcher + thin npm scripts.** `seed:all` extends the S3 dispatcher pattern (`--only <target>`); npm scripts `seed:locations`, `seed:skills`, `seed:admin`, `seed:demo`, `seed:all` map onto it.

**D6 — test rig reuse.** Unit tests use `test/utils/memory-connection.ts`; the e2e smoke uses `createTestApp` with `THROTTLE_LIMIT='100000'` and the `TestMailService` (`MAIL_SERVICE`) so login/publication HTTP calls are not rate-limited and no real mail is sent.

## Risks / Trade-offs

[Normal archive with requirements, not `--skip-specs`] → Requirements live in the `seed-data` capability spec; only data + scripts are created, matching the roadmap's "seeds give requirements" note.
[Quoting/encoding drift in large Arabic/French payloads] → Dataset already compiled and committed in S3; this session only fixes the code-30 entry, not re-typing content.
[Admin seed with weak dev default password] → Defaults are explicit dev-only (`root@admin.test` / `AdminStrong123!`), overridden by `ADMIN_EMAIL`/`ADMIN_PASSWORD`; README/.env note prod must set them.