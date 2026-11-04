## 1. Backend contract

- [x] 1.1 Add shared Algerian phone normalization helper and use it in organization DTOs/services.
- [x] 1.2 Add volunteer weighted completion helper, `GET /volunteers/me/profile-completion`, and dashboard `completion` object + legacy `completionPercent`.
- [x] 1.3 Enrich own skills list with row `_id` and localized skill/category labels.
- [x] 1.4 Add `volunteer_banner` media purpose and enforce it when saving a banner.
- [x] 1.5 Add organization weighted completion with `missingFields` over 12 keys.
- [x] 1.6 Copy the account phone at organization registration; fall back to the account phone when public contact phone is empty.
- [x] 1.7 Gate public organization phone behind optional authentication and return `null` for guests.
- [x] 1.8 Update backend unit tests for completion, skills, banner, phone normalization, registration copy, and public gating.

## 2. Frontend foundation

- [x] 2.1 Update volunteer API schemas: banner, completion shapes, enriched skill rows.
- [x] 2.2 Update organization API schemas: `missingFields`, canonical phone validation, session-aware public profile.
- [x] 2.3 Add shared profile components under `frontend/src/components/profile/`.
- [x] 2.4 Add shared localization helpers for location and skill-category labels.
- [x] 2.5 Remove `silent: true` from profile mutations; ensure success/failure toasts and no duplicate inline “Saved.” text.

## 3. Volunteer profile

- [x] 3.1 Build the complete volunteer form: names, headline, bio, birth date, location selects, avatar, banner, availability note, domains, geographic base.
- [x] 3.2 Rework skills manager to use row `_id` and localized names.
- [x] 3.3 Use the shared completion card with translated `missingFields` and section links.
- [x] 3.4 Fix visibility copy and server-driven toggle defaults.
- [x] 3.5 Update volunteer dashboard completion prompt to respect `complete`.

## 4. Organization profile

- [x] 4.1 Build the shared organization profile form with all fact fields, logo, cover, report, location selects, localized focus multi-select, phone/email.
- [x] 4.2 Use it on `org/profile` and wrap it for `org/complete-profile` with delete-account.
- [x] 4.3 Render completion from `missingFields` with translated labels and section links.
- [x] 4.4 Public org page: session-aware query, signed-in `tel:` link, guest sign-in prompt, localized labels.

## 5. Localization and verification

- [x] 5.1 Add English and Arabic strings with full catalog parity for `volunteer-account`, `org-account`, `orgOnboarding`, `public-orgs`, and `toast`.
- [x] 5.2 Run `openspec validate profile-edit-completion`.
- [x] 5.3 Run backend tests/lint/build.
- [x] 5.4 Run frontend tests/lint/build.
- [x] 5.5 Verify no changes to `useAiChat.ts`, `aiAgent.ts`, or their tests and no commits.
