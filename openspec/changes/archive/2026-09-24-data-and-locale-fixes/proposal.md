# data-and-locale-fixes

## Why

The Session 17 seed dataset still plants the A4 assumption list (28 categories) that the project document later superseded with 7 confirmed volunteer-skill categories, so seeded reference data diverges from the confirmed spec. At the same time the transactional emails (verification / password reset) are still French-only plain text despite the product being Arabic-first (RTL). Both are data/template corrections — no API contract changes.

## What Changes

- Replace `SKILL_CATEGORY_SEEDS` / `SKILL_SEEDS` in `backend/src/seed-data/skills.ts` with the 7 confirmed categories from the project document (bilingual `nameAr` + `nameFr`, canonical ASCII slugs): `media-content`, `hosting-presenting`, `design`, `training-education`, `organization-logistics`, `environment-field`, `other`, each with the listed starter skills (>= 3 per category).
- Make the skill seed path idempotently **reseed**: keep the existing upsert keys, and add a prune step that removes seed rows whose slug is no longer in the catalog (so re-running `seed:skills`/`seed:all` converges to the new dataset on an empty or previously-seeded local/dev DB). No schema, route, or DTO changes.
- Update `seed-demo.ts` demo-skill slugs to reference valid rows in the new catalog.
- Switch the `MailService` templates in `backend/src/mail/mail-templates.ts` from French default to **Arabic default**: RTL-safe `dir="rtl"` HTML body plus a plain-text fallback, for both the verification and password-reset emails. The template mechanism stays locale-swappable (`ar` default, `fr` retained) for later languages.
- Propagate the HTML body through `SmtpMailService` (and keep `LogMailService` rendering the plain-text fallback).
- Update seed/mail tests and e2e assertions that encode the old 28-category catalog or French copy. Docs (`docs/API.md`, `backend-inventory.md`) are updated only where category names appear verbatim (they do not — the categories are data).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `seed-data`: canonical skill catalog is now the 7 confirmed categories; seed path adds a prune/reseed step converging on the new dataset.
- `auth`: `MailService` messages are Arabic by default with an RTL-safe HTML body plus plain-text fallback, and the template mechanism remains locale-swappable.

## Impact

- `backend/src/seed-data/skills.ts` — replaced dataset (data only).
- `backend/src/seed-data/seed.utils.ts` — prune/reseed step for the skill catalog.
- `backend/src/scripts/seed.ts` — invokes the prune step for the `skills`/`all` targets.
- `backend/src/scripts/seed-demo.ts` — demo skill slugs aligned to the new catalog.
- `backend/src/mail/mail-templates.ts` — Arabic default templates (HTML + text), locale-swappable.
- `backend/src/mail/mail.interface.ts` — `MailMessage` gains an optional `html` field.
- `backend/src/mail/smtp-mail.service.ts` — sends the HTML body via nodemailer.
- Tests: `seed-data.spec.ts`, `reference-data.e2e-spec.ts`, `seed-data.e2e-spec.ts` count/slug assertions updated. No schema, route, DTO, or index changes; no new dependencies.