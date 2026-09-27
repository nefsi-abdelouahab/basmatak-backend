## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/orgAccount.ts` profile fns (zod-validated, base `/api/v1`): `getMyOrganization` (`GET /organizations/me` → full fact set incl. `registryId`/`coverMediaId`/`annualReportMediaId?`/location/`foundedYear`), `patchMyOrganization` (`PATCH /organizations/me` → type/registrationNumber/location/website/foundedYear/contact/focusDisciplines/operatingScope/`publicProfile.enabled`; phone/website validation client-side), `getProfileCompletion` (`GET /organizations/me/profile-completion` → percent + remaining fields, display-only), `deleteMyOrganization` (`DELETE /organizations/me`). Own functions only — no import from, or edit to, F3 `organizations.ts`.
- [x] 1.2 Add `lib/api/orgAccount.ts` settings fns: `patchMyUser` (`PATCH /users/me` → email/phone), `changePassword` (`POST /auth/change-password`, 8–72), `listSessions` (`GET /users/me/sessions` → device rows + derived `isCurrent`), `revokeSession` (`DELETE /users/me/sessions/:sessionId`), `logoutOthers` (`POST /auth/logout-others`), `getNotificationPrefs`/`patchNotificationPrefs` (`GET/PATCH /notifications/preferences`), `uploadMedia` + `confirmMedia` (`POST /media/uploads`, `POST /media/:mediaId/confirm` via the F0 shared 2-step helper; purposes `organization_cover`/`organization_logo`/`organization_document`; images/PDF ≤5 MB + imagery-consent gate).
- [x] 1.3 Add pure helpers in `lib/api/orgAccount.ts`: `orgDisplayCode` (`ORG-<registryId>`, display-only, empty-safe) and `completionView` (completion payload → percent + remaining-field link list; no client-side completion math). No `lib/query/keys.ts` edit — the generic F0 factory covers the `org-account` namespace (no archived-file touch).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useOrgAccount.ts` (this session's single hook file): me read/patch + completion + sessions + prefs queries/mutations, all keys from the F0 factory, per-section independent loading (profile never blocks settings). F2 `useAccountSettings.ts` pattern mirrored read-only (no import, no edit either direction). (Logo binding BLOCKED on OQ1 owner go — cover + all settings work unblocked.)

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/org/profile/page.tsx` factsheet: real-facts render (`ORG-<registryId>` display, never a route key), full fact-field edit form via `patchMyOrganization` (no statute/"Law 12-06"/authority/audit input or payload key), cover/logo upload with progress + consent, completion % + remaining-field links, `annualReportMediaId` optional link only (nullable, no workflow), no "Indexed in Discover Talents" copy anywhere.
- [x] 3.2 Add `app/[locale]/org/settings/page.tsx` settings: email/phone edit, change-password (confirm-match), sessions device rows + "This device" badge + revoke-one + logout-others (list re-read after each action), notification prefs toggles, neutral `publicProfile.enabled` toggle (no directory wording), confirm-gated delete-org (revokes session → Login).
- [x] 3.3 Add `src/messages/org-account/en.json` + `ar.json` (prefix `orgAccount.*` only) + `org-account-parity.test.ts`; catalogs auto-merge — never touch `src/i18n/request.ts`; RTL logical-properties check (`ms-/me-/ps-/pe-` only, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.4 Error/empty/loading states on both routes via F0 error mapping incl. 401/403/404/429/503; org-guest access redirects to Login; DOM asserts: no dossier-upload (F3), no admin-management (F15), no messaging, no statute/authority/audit affordances on either route.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: completion-% display passthrough; `orgDisplayCode` (`ORG-<registryId>`, empty-safe); phone-regex + website validation gates; consent-gate (upload blocked without consent); delete-confirm gating (action disabled until gate complete); allowlist + 5 MB size guard.
- [x] 4.2 E2E profile: edit all fact fields → save → factsheet reflects; cover/logo upload → confirm → bound; public-profile spot-check via F18 `(public)/orgs/[slug]` route (mocked public read if F18 unimplemented; re-run at F18/F19); no statute/legal/directory copy in DOM.
- [x] 4.3 E2E settings: sessions render with device rows + this-device badge; revoke-one + logout-others (re-read shows only current); prefs toggle → persist → re-render; visibility toggle persists neutrally; delete-org (confirm gate) revokes session → Login.
- [x] 4.4 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (F0 grep gates); no out-of-scope affordances in DOM (dossier, admin, messaging, statute/audit).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-org-account` + `openspec status --change frontend-org-account` clean; archive only after owner go on OQ1 (logo field binding) + OQ2 (verification-status placement).
