## Why

Volunteers have no self-service account area: delta doc §C#4–5 confirms Volunteer Profile (own) and Volunteer Settings are missing screens backed by real v2 routes. Without them, volunteers cannot complete their identity, manage skills/availability, control public exposure (opt-out-by-default), or manage sessions and account deletion.

## What Changes

- New route `volunteer/profile`: identity edit (`GET/PATCH /volunteers/me`), avatar upload (2-step presigned, purpose `avatar`), skills CRUD, availability editor, opt-out public toggles (ALL DEFAULT ON), dashboard completion readout, "View public profile" link to `/volunteers/<username>` (no `@`).
- New route `volunteer/settings`: email/phone edit with re-verify (`PATCH /users/me`), change password, sessions list/revoke + logout-others, notification preferences, soft-delete with confirm (`DELETE /users/me`).
- New API modules `lib/api/volunteers.ts`, `lib/api/users.ts`, `lib/api/notifications.ts`, shared 2-step upload helper `lib/api/media.ts` (F0 shipped download-only); hooks `hooks/useVolunteerAccount.ts`, `hooks/useAccountSettings.ts`; catalogs `messages/volunteer-account/{en,ar}.json`.
- Change-password/logout-others calls are consumed from F1's `lib/api/auth.ts` (import-only, no edits).

## Capabilities

### New Capabilities
- `volunteer-profile`: own identity, avatar upload, skills, availability, opt-out public toggles, dashboard completion display.
- `volunteer-settings`: email/phone re-verify, change-password UI, sessions management, notification prefs, soft delete.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 2 routes, 4 api modules, 2 hook files, 1 message prefix. Consumes F0 theme/i18n/api-client/primitives (no edits to archived files).
- Declares `lib/api/media.ts` as the single shared upload helper for later sessions (F3/F7/F8/F10 consume it).
- Depends on F1's `lib/api/auth.ts` exports (`changePassword`, `logoutOthers`); F13 consumes settings patterns via its own `orgAccount.ts`.
