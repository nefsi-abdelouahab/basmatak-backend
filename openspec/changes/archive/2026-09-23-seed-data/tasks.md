## 1. Canonical location dataset

- [x] 1.1 Confirm/fix `src/seed-data/locations.ts` as the single source of truth: 58 wilayas (codes 01–58, distinct, bilingual) and 1,541 municipalities with official codes + `nameAr`/`nameFr` + `parentCode`; keep the source + date header. Fix wilaya code 30 to `Ouargla` (was wrongly `Touggourt`; Touggourt is code 55).
- [x] 1.2 Keep the idempotent `bulkWrite` upserts keyed by unique `code` in `seed.utils.ts seedLocations`.

## 2. Canonical skill catalog

- [x] 2.1 Ensure `src/seed-data/skills.ts` matches A4 exactly: every category (slug, order, active) with at least three starter skills (slug + bilingual names); no category removed or re-slugged.

## 3. Admin and demo bootstrap scripts

- [x] 3.1 Add `src/scripts/seed-admin.ts`: upsert `users` with role `admin` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (dev defaults `root@admin.test`/`AdminStrong123!`); never reset an existing admin password unless `SEED_ADMIN_RESET=true`; use the S2 service-level admin-capable creation path.
- [x] 3.2 Add `src/scripts/seed-demo.ts`: one verified demo organization (user + org via the S15 service path — create a real pending `organization_verifications` row then approve through `AdminOrganizationsService`) plus one demo volunteer with a profile and catalog skills; idempotent by stable emails.
- [x] 3.3 Wire the new scripts into the S3 dispatcher (`src/scripts/seed.ts`) with `--only` targets and add npm scripts: `seed:locations`, `seed:skills`, `seed:admin`, `seed:demo`, `seed:all`.

## 4. Unit tests

- [x] 4.1 Seed idempotency: run each seed twice against a fresh memory DB → identical record counts, no duplicates (locations, skills).
- [x] 4.2 `seed-admin`: preserves an existing admin password across re-runs unless `SEED_ADMIN_RESET=true`.

## 5. E2E smoke (F1 closure)

- [x] 5.1 `test/seed-data.e2e-spec.ts`: run `seed:all` against a fresh memory DB → 58 wilayas, full municipality/category/skill counts, 1 admin, 1 verified demo org, 1 demo volunteer.
- [x] 5.2 Assert the seeded admin can log in via `POST /auth/login` and the verified demo org can publish (F1 regression).

## 6. Verification

- [x] 6.1 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 6.2 `openspec validate seed-data` and `openspec validate --all --strict` pass; archive `seed-data`.