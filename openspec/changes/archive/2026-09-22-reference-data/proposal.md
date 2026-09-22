## Why

Session 2 shipped identity, but every public surface the roadmap programs against — opportunity feeds filtered by wilaya/municipality (S6), volunteer profiles tagged with skills (S4), public discovery (S12) — depends on shared reference data that does not exist yet. Nothing can be scoped to a wilaya and no profile can carry a skill until locations and the skill catalog are real. This change seeds Algeria's 58 wilayas + municipalities and the A4 skill catalog as reference data, exposes them to guests, lets admins maintain them, and establishes the canonical slugify pipeline (A12) that Sessions 5 and 6 reuse.

## What Changes

- Add `locations`, `skill_categories`, `skills` models with the inventory §3 indexes: `locations` unique `code` + `(type, parentCode)`, `skill_categories` unique `slug` + index `order`, `skills` unique `slug` + `categoryId`.
- Public read endpoints: `GET /api/v1/locations/wilayas`, `GET /api/v1/locations/wilayas/:wilayaId/municipalities`, `GET /api/v1/skill-categories` (active, ordered by `order`), `GET /api/v1/skills?categoryId=&q=`. Guest-readable; cacheable via response headers.
- Admin maintenance endpoints: `POST/PATCH /admin/locations(/:id)`, `POST/PATCH /admin/skill-categories(/:id)`, `POST/PATCH /admin/skills(/:id)`, gated by the S2 `@Roles('admin')` guard. Skills/categories deactivate-not-delete (`active:false`); no DELETE routes.
- Seed scripts `seed:locations`, `seed:skills`, `seed:all` behind a `src/scripts/seed.ts` dispatcher (`--only locations|skills`), idempotent via `bulkWrite` upserts keyed by `code`/`slug`. `src/seed-data/locations.ts` carries the full real dataset (58 wilayas codes 01–58 + municipalities with official codes, `name_ar`/`name_fr`) and `src/seed-data/skills.ts` the A4 category list with a starter set of ≥3 skills per category; both record source + date in the file header.
- Canonical slug pipeline: `slugify` (transliterated to ASCII) with E11000 collision retry appending a numeric suffix (A12), implemented once as a shared util for S5/S6 reuse.
- New package: `slugify` only. No new env vars, no schema/config changes.

## Capabilities

### New Capabilities
- `locations`: `locations` model + indexes; guest GET of wilayas and municipalities for a wilaya; admin maintenance; seeded complete dataset of 58 wilayas + municipalities.
- `skills`: `skill_categories` and `skills` models (slug/order/active); guest GET of active categories ordered by `order` and skills filtered by `categoryId`/`q`; admin maintenance with deactivate-not-delete; A4 catalog + starter skills seeded.

### Modified Capabilities
- None. The admin role gate, error envelope, decorators, and guard stack already exist and are only reused.

## Impact

- New module trees in `/backend/src/locations` and `/backend/src/skills`; shared slug utility in `/backend/src/common/` (reused by S5/S6); seed dispatcher + data files in `/backend/src/scripts` and `/backend/src/seed-data`.
- New collections: `locations`, `skill_categories`, `skills`.
- New routes: the public and admin lists above under the `api/v1` prefix; admin routes reuse `@Roles('admin')` from S2.
- New npm scripts: `seed:locations`, `seed:skills`, `seed:all`.
- New runtime dependency: `slugify`.
- Out of scope (roadmap §4 S3): frontend pickers, 2dsphere/geo (no coordinates), translations beyond ar/fr, any other module.