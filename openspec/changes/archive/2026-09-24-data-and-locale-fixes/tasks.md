# data-and-locale-fixes — Tasks

## 1. Skill catalog data swap

- [ ] 1.1 Replace `SKILL_CATEGORY_SEEDS` in `backend/src/seed-data/skills.ts` with the 7 confirmed categories (slugs `media-content`, `hosting-presenting`, `design`, `training-education`, `organization-logistics`, `environment-field`, `other`; bilingual `nameAr`/`nameFr`; `order` 1–7).
- [ ] 1.2 Replace `SKILL_SEEDS` with the starter skills for the 7 categories (>= 3 per category; bilingual names; `categorySlug` matching the new category slugs).

## 2. Idempotent reseed step

- [ ] 2.1 Add `pruneSkillCatalog(categoryModel, skillModel)` to `backend/src/seed-data/seed.utils.ts` that deletes `skills` and `skill_categories` rows whose slug is not in the current seed lists (skills first, then categories), returning removed counts.
- [ ] 2.2 Wire the prune step into `backend/src/scripts/seed.ts` for the `skills` and `all` targets (run after `seedSkills`).

## 3. Demo seed alignment

- [ ] 3.1 Update `DEMO_SKILL_SLUGS` and the `isPrimary` flag in `backend/src/scripts/seed-demo.ts` to slugs that exist in the new catalog.

## 4. Arabic mail templates

- [ ] 4.1 Add `html?: string` to `MailMessage` in `backend/src/mail/mail.interface.ts` and update its doc comment (Arabic default, RTL HTML + text).
- [ ] 4.2 Rework `backend/src/mail/mail-templates.ts`: `MailLocale = 'ar' | 'fr'`, instance default `ar`, and `verification*`/`passwordReset*` subject/text/html renderers per locale (Arabic RTL HTML `dir="rtl"` `lang="ar"`; French retained).
- [ ] 4.3 Update `SmtpMailService` to pass the HTML body through to nodemailer; keep `LogMailService` logging the plain-text fallback.

## 5. Test updates

- [ ] 5.1 Update `backend/src/seed-data/seed-data.spec.ts` (hard-coded `28`/`28 * 3` → 7-based assertions) and add a prune-convergence unit test.
- [ ] 5.2 Update `backend/test/reference-data.e2e-spec.ts`: category count 28 → 7, `q=secourisme` → a term in the new catalog (e.g. `montage`), and the slug-collision creation (French name + expected `design-1`).
- [ ] 5.3 Verify `backend/test/seed-data.e2e-spec.ts` still passes with the new catalog (demo volunteer skills ≥ 1).

## 6. Verification

- [ ] 6.1 Run `npm run build`, `npm run lint`, `npm test`, and `npm run test:e2e` in `backend/`; confirm all green.
- [ ] 6.2 Grep `docs/API.md` and `backend-inventory.md` for verbatim category names (expected none); only edit them if category names appear.
- [ ] 6.3 Validate the change with `openspec validate data-and-locale-fixes`.