## Why

The product needs real, complete production/dev reference data and a working admin account before the core loop can be exercised end-to-end (Session 18). Today only reduced location and skill payloads exist (S3), there is no admin seed script (F14), and a demo organization verification dead-end blocks manual QA even after Session 15 (F1).

## What Changes

- Promote `src/seed-data/locations.ts` to the canonical full dataset: all 58 wilayas (codes 01–58) with `nameAr`/`nameFr`, plus all municipalities with official administrative codes, bilingual names, and `parentCode`. Idempotent `bulkWrite` upserts keyed by code.
- Complete `src/seed-data/skills.ts` per assumption A4: every category (slug, order, active) with at least three starter skills (slug + name). Data-only; no schema impact (F10).
- Add `src/scripts/seed-admin.ts`: upserts a `users` row with role `admin` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (env; dev defaults). Never resets an existing admin password unless `SEED_ADMIN_RESET=true` (F14).
- Add `src/scripts/seed-demo.ts`: one verified demo organization (user + org, `verificationStatus=verified` through the same service path as the S15 admin approval — no orphan field writes) and one demo volunteer with a profile and skills. Idempotent by stable emails.
- Add npm scripts `seed:locations`, `seed:skills`, `seed:admin`, `seed:demo`, `seed:all` (runs the four idempotently).
- Unit tests (seed idempotency, admin password preservation) and an E2E smoke proving F1 closure: seeded admin can log in and the verified demo org can publish.

## Capabilities

### New Capabilities
- `seed-data`: canonical location/skill payloads plus idempotent admin and demo bootstrap scripts.

### Modified Capabilities
<!-- none: this change adds data and scripts only, no requirement-level behavior change -->

## Impact

- Code: `backend/src/seed-data/`, `backend/src/scripts/`, `backend/package.json`, backend unit + e2e specs.
- Collections touched by seed scripts: `users`, `organizations`, `locations`, `skill_categories`, `skills`.
- No new packages, env vars (reuses `ADMIN_EMAIL`/`ADMIN_PASSWORD` already in `.env.example`), or schema changes.