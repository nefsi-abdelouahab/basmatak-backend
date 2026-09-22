## 1. Models, schemas, and slug util

- [x] 1.1 Install the runtime dep: `npm i slugify` in `/backend`
- [x] 1.2 Add the `Location` schema via `createSchema` (`code`, `type` wilaya|municipality, `parentCode?`, `nameAr`, `nameFr`, `legacyId?`) with unique `code` and `(type, parentCode)` indexes
- [x] 1.3 Add the `SkillCategory` schema via `createSchema` (`slug` unique, `nameAr`, `nameFr`, `order`, `active` default true) with indexes unique `slug` and `order`
- [x] 1.4 Add the `Skill` schema via `createSchema` (`slug` unique, `categoryId`, `nameAr`, `nameFr`, `order`, `active`) with indexes unique `slug` and `categoryId`
- [x] 1.5 Implement the canonical slug pipeline in `src/common/slug/`: `slugifyText` (transliterate ASCII, lowercase, spaces→`-`, strip non-alphanumerics) + `ensureUniqueSlug` retrying on `E11000` with a `-N` numeric suffix (bounded attempts, then rethrow)

## 2. Public read endpoints

- [x] 2.1 Implement the locations controller: `GET /locations/wilayas` (public, ordered by `code`), `GET /locations/wilayas/:wilayaId/municipalities` (public, `parentCode = wilaya code`, ordered by `code`, 404 for unknown wilaya)
- [x] 2.2 Implement the skills controller: `GET /skill-categories` (public, `active` only, ordered by `order`), `GET /skills?categoryId=&q=` (public, `active` only, optional `categoryId` and case-insensitive `q`, ordered by `order` then `nameFr`)
- [x] 2.3 Add `Cache-Control` headers on the four public reads using a TTL from `SettingsService` (`cache_policy.referenceData`, default 300s)
- [x] 2.4 Register the `locations` and `skills` modules/models in the app (`AppModule`)

## 3. Admin maintenance endpoints

- [x] 3.1 Admin locations: `POST /admin/locations` and `PATCH /admin/locations/:id` with `@Roles('admin')`; DTO rejects duplicate `code` (409), `parentCode` required and different from `code` when `type=municipality`; no active field
- [x] 3.2 Admin skill categories: `POST/PATCH /admin/skill-categories(/:id)` with `@Roles('admin')`; slug generated server-side (rejected from body), `PATCH` allows `active:false` deactivation; duplicate slug 409
- [x] 3.3 Admin skills: `POST/PATCH /admin/skills(/:id)` with `@Roles('admin')`; `categoryId` required on create; slug generated server-side; `PATCH` allows `active:false`; duplicate slug 409

## 4. Seed data and scripts

- [x] 4.1 Build `src/seed-data/locations.ts`: the complete real dataset — 58 wilayas (codes `01`–`58`, `nameAr`, `nameFr`) plus their municipalities (official codes, `nameAr`, `nameFr`) — with a source + date header comment
- [x] 4.2 Build `src/seed-data/skills.ts`: the A4 category list (names, `order`, `active`) and a starter set of at least 3 skills per category
- [x] 4.3 Implement `src/scripts/seed.ts` dispatcher (`NestFactory.createApplicationContext(AppModule)`, `--only locations|skills|all`) with `bulkWrite` upserts keyed by `code` / `slug` (locations, then skills); sections refactored into a shared seed utility
- [x] 4.4 Add npm scripts `seed:locations`, `seed:skills`, `seed:all` in `/backend` package.json

## 5. Tests

- [x] 5.1 Unit tests for the slug pipeline: transliteration + kebab casing; `E11000` collision retry yields `-1`/`-N` suffix (mocked unique-index error); bounded retry rethrows
- [x] 5.2 Unit/targeted tests for seed idempotency: running the locations and skills seed payloads twice on the same models yields identical document counts
- [x] 5.3 E2E: run the seed dispatcher against the memory DB, then assert `GET /locations/wilayas` returns 58, `GET /locations/wilayas/16/municipalities` is non-empty, `GET /skill-categories` is ordered + active-only, `GET /skills?categoryId=` filters, and guests can read all four endpoints
- [x] 5.4 E2E: admin CRUD — `POST`/`PATCH` for locations/categories/skills with a real admin-role bearer token; deactivating a skill/category via `PATCH` hides it from public reads; duplicate `code`/`slug` → 409; non-admin bearer → 403
- [x] 5.5 Run `npm run build && npm run lint && npm test && npm run test:e2e` from `/backend` until all green

## 6. Verification and commit

- [x] 6.1 Run `npm run seed:locations` and `npm run seed:skills` locally and confirm counts (58 wilayas; A4 categories + starter skills) and that a second run is stable
- [x] 6.2 From the repo root run `openspec validate reference-data` and `openspec status --change reference-data` (all artifacts done); then `openspec archive reference-data -y`
- [x] 6.3 Commit locally only with message `feat(reference-data): wilayas, municipalities, skill catalog with idempotent seeds`