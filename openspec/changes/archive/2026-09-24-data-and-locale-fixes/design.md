## Context

The seed catalog (`backend/src/seed-data/skills.ts`) currently carries the Session 17 A4 assumption list (28 categories, ~90 skills) that was flagged for confirmation against the project document. The confirmed list is 7 volunteer-skill categories. The other side of this change is the mail seam (`backend/src/mail/`): `MailTemplates` renders French plain-text only, so `SmtpMailService`/`LogMailService` cannot send an Arabic-first, RTL-safe message.

Constraints: no schema, route, DTO, or index changes; data + template only. The skill seed must stay idempotent and keep the deactivate-not-delete behavior for rows that remain in the catalog.

## Goals / Non-Goals

**Goals:**

- Seed exactly the 7 confirmed categories and their starter skills (>= 3/category), bilingual `nameAr`+`nameFr`, canonical ASCII slugs.
- Keep the seed path idempotent AND converging: re-running `seed:skills`/`seed:all` on a previously-seeded local/dev DB (old 28-category dataset) removes legacy seed rows and inserts the current catalog.
- Keep demo seeding (peer of the admin/bootstrap seeding) valid by pointing its skill slugs at real catalog rows.
- Emails: Arabic-default subject + RTL HTML (`dir="rtl"`) + plain-text fallback for verification and password reset; locale-swappable for later languages.
- Keep all seed/mail/e2e tests green; update only assertions that encode the old dataset or French copy.

**Non-Goals:**

- No schema/route/DTO changes; no new collections.
- No editing seed rows through the admin CRUD behavior (deactivate-not-delete stays as-is for rows still in the catalog).
- No runtime i18n plumbing beyond the single mail locale (no per-user email language, no translation files).
- No migration runner/framework — a targeted `prune` inside the seed path only.

## Decisions

1. **Single source of truth stays in `seed-data/skills.ts`.** Categories and skills remain exported constants consumed by `seed.utils.ts` and asserted by tests, mirroring the existing pattern for locations. Counts in unit/e2e tests read `SKILL_CATEGORY_SEEDS.length`/`SKILL_SEEDS.length`; two hard-coded `28` assertions are updated to 7.

2. **Reseed = upsert + prune, not drop-collection.** `seedSkills` keeps its `bulkWrite` upserts (idempotent by slug); a new exported `pruneSkillCatalog(categoryModel, skillModel)` deletes `skills`/`skill_categories` rows whose `slug` is not in the current seed lists. Reasoning: dropping whole collections would remove admin-created rows and user `volunteer_skills` links; slug-scoped pruning only targets stale seed rows. Note: on a dev DB this still removes any admin-created category/skill that is not part of the catalog — acceptable for dev/local (a real deployed DB would need an explicit re-seed, noted for the PR). Empty-DB behavior is a no-op (nothing to delete).

3. **Prune runs via the seed script, not inside `seedSkills`.** `seed.ts` calls `pruneSkillCatalog` after `seedSkills` for the `skills`/`all` targets. `seedSkills` stays a pure upsert so the unit tests that assert deactivate-preservation and the e2e suites that seed then create admin-rows are unaffected by deletion semantics.

4. **Demo skill slugs updated.** `seed-demo.ts` `DEMO_SKILL_SLUGS` (`secourisme-de-base`, `soutien-scolaire-en-mathematiques`, `garde-denfants`) → slugs that exist in the new catalog (`photographie`, `montage`, `programmation`), with the `isPrimary` flag re-pointed to `photographie`. This keeps the `seed-data.e2e` "demo volunteer with catalog skills ≥ 1" assertion passing.

5. **Mail: Arabic default, locale-swappable, HTML + text.** `MailTemplates` gains a `MailLocale = 'ar' | 'fr'` type, per-locale subject/text/html renderers, and an instance default locale (`ar`). `MailMessage` gains an optional `html`. `SmtpMailService` forwards `html` to nodemailer; `LogMailService` keeps logging the plain-text body (the fallback), so dev parity does not dump raw HTML into logs. French templates are retained as the non-default locale to demonstrate swappability.

## Risks / Trade-offs

- **Prune removes non-catalog admin-created reference rows on a dev DB** → Mitigation: prune is slug-scoped to rows missing from the current catalog, runs only through the explicit seed script, and the PR notes that a real deployed Atlas DB would need a deliberate re-seed (nothing is deployed yet).
- **Deleting seed skills that a `volunteer_skills` row references on an already-seeded DB** → Mitigation: only relevant for developers running against a previously-seeded DB; acceptable for local dev, and noted for the PR.
- **Changing the reference-data e2e seed assumptions (28 categories / `q=secourisme` / `secourisme-and-sante-1` slug collision)** → Mitigation: assertions re-point to equivalent checks against the new catalog (`7` categories, `q=montage`, `Design` → `design-1` collision).
- **Mail tests assert raw French copy** → Mitigation: verified none exist; asserts are behavior-only (fake mail records kind+token).

## Migration Plan

1. Replace the skill seed dataset; update unit + e2e assertions.
2. Add `pruneSkillCatalog` and wire it into `seed.ts`.
3. Update `seed-demo.ts` skill slugs.
4. Rework `MailTemplates` to locale-aware Arabic-default HTML+text; extend `MailMessage`; update providers.
5. Run `npm run build`, `lint`, `test`, `test:e2e`; confirm green.
6. No deployed database to migrate; the reseed step is forward-compatible (legacy rows pruned on the next `seed:skills`/`seed:all`).

## Open Questions

None — the project-document category list was provided in the request.