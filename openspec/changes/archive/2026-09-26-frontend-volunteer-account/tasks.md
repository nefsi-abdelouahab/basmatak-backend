## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/volunteers.ts`: `getVolunteerMe`, `patchVolunteerMe`, `patchPublicSettings`, `getVolunteerDashboard`, `listMySkills`, `createMySkill`, `patchMySkill`, `deleteMySkill`, `getMyAvailability`, `putMyAvailability`, `listSkills`, `listSkillCategories` (12 fns; endpoints §F2 list; toggles read from `GET /volunteers/me`, written via `PATCH /volunteers/me/public-settings`).
- [x] 1.2 Add `lib/api/media.ts`: `createUpload` (`POST /media/uploads`, purpose `avatar`), `confirmUpload` (`POST /media/:mediaId/confirm`), `uploadWithProgress` (PUT bytes + progress callback; jpeg/png/webp ≤5 MB guard). Shared helper for F3/F7/F8/F10.
- [x] 1.3 Add `lib/api/users.ts`: `getUsersMe`, `patchUsersMe`, `deleteUsersMe`, `listMySessions`, `deleteMySession` (`GET/PATCH/DELETE /users/me`, `GET/DELETE /users/me/sessions[/:sessionId]`).
- [x] 1.4 Add `lib/api/notifications.ts`: `getPreferences`, `patchPreferences` (`GET/PATCH /notifications/preferences`).
- [x] 1.5 No `lib/query/keys.ts` edit needed — the generic F0 factory covers the `volunteer-profile` / `account-settings` namespaces (deviation from draft: fewer edits, no archived-file touch).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useVolunteerAccount.ts`: profile query/mutation, skills CRUD, availability GET/PUT, public-settings toggles (opt-out, default ON), dashboard completion read, avatar-upload composition over `lib/api/media.ts`.
- [x] 2.2 Add `hooks/useAccountSettings.ts`: users/me query/mutations, sessions list/revoke + `isCurrent` derivation, notification prefs, delete-account; imports `changePassword`/`logoutOthers` from F1 `lib/api/auth.ts` (BLOCKED if F1 unimplemented — flag, do not duplicate).

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/volunteer/profile/page.tsx`: identity form (zod: phone `/^\+?[0-9]{8,15}$/`), avatar uploader with progress (OQ1 pattern), skills manager (API-backed picker), availability editor, opt-out toggle panel incl. `showStats` (OQ2 copy), completion readout, public link `/volunteers/<username>` (no `@`).
- [x] 3.2 Add `app/[locale]/volunteer/settings/page.tsx`: email/phone edit with re-verify notice, change-password form (8–72), sessions table with "This device" badge + revoke + logout-others, notification toggles (6 prefs, default ON), delete-account confirm dialog.
- [x] 3.3 Add `messages/volunteer-account/en.json` + `ar.json` (prefix `volunteerAccount.*`); wire into next-intl config; RTL logical-properties check (`ms-/me-/ps-/pe-` only).
- [x] 3.4 Error/empty/loading states on both routes via F0 error mapping incl. 401/403/404/429; guest access redirects to Login (decision 10).

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: phone-regex + password-length validation; completion-% display; toggle-gating (opt-out hides nothing client-side, defaults ON); `isCurrent` badge logic (exactly one).
- [x] 4.2 Unit: 2-step upload composer (oversize/wrong-type blocked before `POST /media/uploads`; confirm-then-patch ordering, mocked).
- [x] 4.3 E2E: edit profile + skills + availability + toggles persist across reload; avatar upload shows progress then renders.
- [x] 4.4 E2E: sessions list shows device rows; per-session revoke removes row; logout-others keeps current session valid; delete-account requires confirm then signs out to `/`.
- [x] 4.5 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (grep gates from F0 acceptance).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-volunteer-account` + `openspec status --change frontend-volunteer-account` clean; archive only after owner go on OQ1/OQ2.
