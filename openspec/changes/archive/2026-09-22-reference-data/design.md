## Context

Session 1 shipped the cross-cutting core and Session 2 shipped identity (`users`/`sessions`/`verification_tokens`, real JWT guard stack, `@Roles('admin')` gate, error envelope `{ statusCode, code, message, details? }`, `AppValidationPipe` with `whitelist` + `forbidNonWhitelisted`, global prefix `api/v1`). This session delivers the P1 reference data every later module filters against: Algeria's 58 wilayas + municipalities and the A4 skill catalog. It also lands the canonical slugify pipeline (A12) that S5 (organizations `slug`) and S6 (opportunities `slug`) reuse. Constraints are unchanged: single-instance free tier (in-memory throttler), no Redis/queues, `mongodb-memory-server` replica-set test rig, `SettingsService` (30s cache) over `system_settings`, base-schema helper (`createSchema`) for timestamps/transforms, backticks-free. The inventory places admin CRUD under these P1 modules (§2.3/§2.4) so it is implemented here, not in S15; the admin role guard already exists from S2. Roadmap Session 3 (docs/ROADMAP.md §4) overrides the inventory on two points: locations use `parentCode` (not `parentId`) and have no 2dsphere/coordinates.

## Goals / Non-Goals

**Goals:**
- `locations`, `skill_categories`, `skills` models via `createSchema` with the §3 indexes (locations unique `code` + `(type, parentCode)`; categories unique `slug` + `order`; skills unique `slug` + `categoryId`).
- Public reads (guest-accessible, `@Public()`): `GET /api/v1/locations/wilayas`, `GET /api/v1/locations/wilayas/:wilayaId/municipalities`, `GET /api/v1/skill-categories`, `GET /api/v1/skills?categoryId=&q=` — ordered consistently and cacheable via a `Cache-Control` header.
- Admin maintenance (`@Roles('admin')`): `POST/PATCH /admin/locations(/:id)`, `POST/PATCH /admin/skill-categories(/:id)`, `POST/PATCH /admin/skills(/:id)`; skills/categories deactivate-not-delete.
- Canonical slug pipeline in `src/common/` (transliterate→ASCII, kebab, E11000 retry with `-N` suffix) tested with a mocked duplicate-key error.
- `src/seed-data/locations.ts` (complete real dataset, source + date header) and `src/seed-data/skills.ts` (A4 categories + ≥3 skills each) loaded by a `src/scripts/seed.ts` dispatcher, idempotent via `bulkWrite` upserts; npm scripts `seed:locations`, `seed:skills`, `seed:all`.
- New dependency `slugify` only; no new env vars; `.env.example` unchanged.

**Non-Goals:**
- No DELETE routes anywhere (deactivate-not-delete; locations are reference-only, admin edits names).
- No frontend pickers, no 2dsphere/geo, no translations beyond `ar`/`fr`.
- No admin read/list routes (not in §2.3/§2.4; admin maintenance works from IDs known via seed/public reads).
- No cache invalidation after admin writes (TTL header only; eventually consistent — acceptable for reference data).
- No slug editing (slug generated on create only), no bulk import endpoint, no soft-deleted-row recycling.

## Decisions

### D1. Locations keyed by official `code`; municipalities reference wilaya via `parentCode`
`locations` = `{ code, type: 'wilaya'|'municipality', parentCode?, nameAr, nameFr, legacyId? }`. Unique `code`, index `(type, parentCode)`. Wilaya codes are zero-padded strings `'01'..'58'`; municipality codes are their official administrative codes (e.g., `'1601'`). Rationale: roadmap S3 defines this schema explicitly and codes are stable, human-known identifiers that make the seed trivially idempotent and future `wilayaId` filters on opportunities exact. The inventory's `parentId` + 2dsphere `coordinates` is overridden by the roadmap (no geo in this session). Alternative rejected: Mongo `ObjectId` parents — loses the stable human-readable `code` contract and complicates seed upserts.

### D2. Slug pipeline as a shared util with E11000 retry (A12)
`slugifyText(name)` → `slugify` (ASCII transliteration), lowercase, spaces→`-`, strip non-alphanumeric. `ensureUniqueSlug(model, base, filter)` tries an insert of `base`; on an `E11000` unique-index error it retries with `base-1`, `base-2`, ... (bounded attempts, then rethrow). Rationale: A12 mandates retry-on-collision; relying on the unique index makes the check+insert race-free (no TOCTOU from a pre-check). Alternative rejected: reading the collection to pick the max suffix — a concurrent insert between check and write produces a duplicate; the unique index is the source of truth. The util is placed in `src/common/slug/` so S5 and S6 consume the identical pipeline.

### D3. Seed scripts idempotent via `bulkWrite` upserts behind one dispatcher
`src/scripts/seed.ts` bootstraps a Nest standalone application context (`NestFactory.createApplicationContext(AppModule)`) so it reuses the real models, config, and validation rather than a second mongoose wiring. `--only locations|skills|all` selects the section(s). Each section builds `bulkWrite([{ updateOne: { filter: { code } | { slug }, update: { $set: … }, upsert: true } }, …])`. Re-running updates matching rows in place so counts stay stable. Rationale: reuse of AppModule prevents model drift and keeps e2e bootstrapping code shared; `bulkWrite` upserts are the documented idempotency mechanism in the roadmap. Alternative rejected: `deleteMany` then insert — destroys admin edits made between runs; upsert-in-place preserves them.

### D4. Admin gating is plain S2 `@Roles('admin')`; deactivation hides from public
Admin controllers reuse `@Roles('admin')` and the existing `RolesGuard` (registered `APP_GUARD`); no new guard logic. Skill/category `PATCH` accepts `active:false` (deactivate-not-delete); public reads filter `active:true` so a deactivated row disappears from guests but keeps its row, slug, and history for later re-activation. Locations have no `active` flag — they are editable reference data. Rationale: §2.3/§2.4 and the roadmap. Alternative rejected: DELETE + `deletedAt` soft-delete — roadmap explicitly says deactivate-not-delete for skills; locations keep the inventory's `legacyId` field for source tracking instead.

### D5. Consistent ordering + cache headers
Wilayas and municipalities order by `code` ascending (stringt-safe zero-padded). Categories order by `order` ascending; skills order by `order` ascending then `nameFr`. The four public reads set `Cache-Control: public, max-age=<ttl>` where `<ttl>` defaults to 300s read from the `SettingsService` key `cache_policy.referenceData` (falls back gracefully if unset). Rationale: roadmap marks the wilaya/category reads "cacheable" and the settings service already exists with a 30s in-memory cache; frontend pickers can then rely on browser/proxy caching. Alternative rejected: fixed hard-coded header — keeps a knob without new env vars.

### D6. Skill DTOs and public `/skills` semantics
Create DTOs: `location` requires `code`/`type`/`nameAr`/`nameFr` (+`parentCode` required when `type=municipality`, must differ from `code`); category/skill creates require names + `order`, the server generates `slug` (never accepted from the body) and sets `active` default `true`; `categoryId` required when creating a skill. All go through the global pipe so unknown fields → 400. Public `/skills` returns active skills only, filtered by optional `categoryId`, and `q` matched case-insensitively against both names (Mongo regex, escaped). No join to category `active` state — hiding a category leaves its skills listable unless the admin also deactivates them (documented as an admin responsibility). Rationale: keeps the read single-query and cheap; the roadmap specifies only the `categoryId`/`q` filters.

### D7. Dataset provenance per A4
`src/seed-data/locations.ts` carries a header comment with the source (well-known open Algerian administrative-divisions dataset) and the fetch date, per A4 ("data quality is confirmable later"). The file is TS with typed arrays (`WilayaSeed[]`, `MunicipalitySeed[]`) so the dispatcher can type-check them. Rationale: A4 instructs recording source/date; typed literals keep the dataset honest at compile time.

## Risks / Trade-offs

- [Locations dataset accuracy/sourcing offline] → Mitigation: dataset is fetched from a well-known open Algerian admin-divisions source during this session; source + date recorded in the header; `seed:locations` must produce 58 wilayas locally before verification.
- [Non-ASCII names may not all transliterate cleanly for slugs] → Mitigation: `slugify` handles Arabic→ASCII transliteration; collision retry guarantees uniqueness regardless; names themselves are stored untransliterated (`nameAr`/`nameFr`) and only slugs are ASCII.
- [Race between seed and admin edits on the same code/slug] → Mitigation: seed upserts `$set` known seed fields only; admin changes not overwritten by seed fields intentionally keep order of operations in the dispatcher (locations then skills) — acceptable for reference data.
- [Repeated seed grows `order` drift if seeds edited later] → Mitigation: seeds are static per release; upsert `$set` keeps them consistent on every run.
- [Public reads of inactive category's still-active skills] → Mitigation: accepted; admin deactivates skills explicitly (documented in D6).

## Migration Plan

No data migration — three new collections seeded by scripts. Rollback = revert this session's commit (later sessions S4/S6 read these tables but the roadmap orders strictly). Operational: run `npm run seed:locations` and `npm run seed:skills` once against dev DB before verification; `.env.example` unchanged (no new env vars).

## Open Questions

- None blocking. (Category/skill `nameAr` translations follow the same A4 list; exact Arabic wording confirmed against the project document at S17 — flagged per A4.)