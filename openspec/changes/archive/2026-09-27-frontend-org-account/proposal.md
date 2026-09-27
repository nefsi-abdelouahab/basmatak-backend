## Why

Organizations cannot view or edit their own factsheet, nor manage account settings: delta doc V2 §B#16/#17 confirms Organization Profile and Organization Settings were blocked on expanded PATCH scope, cover/logo uploads, session device rows, notification prefs, neutral visibility, and org delete. The v2 backend now backs all of it, so F13 closes the org self-service loop that F3 (onboarding) starts.

## What Changes

- New route `org/profile`: organization factsheet — expanded `PATCH /organizations/me` (type, registrationNumber, location, website, foundedYear, contact, focusDisciplines, operatingScope), cover/logo uploads via shared 2-step flow (purposes `organization_cover` / `organization_logo`), profile-completion % reuse, optional `annualReportMediaId` link only (purpose `organization_document`, no workflow), `ORG-<registryId>` display-only. "Indexed in Discover Talents" relabeled/removed (orgs aren't in the directory).
- New route `org/settings`: account settings — email/phone (`PATCH /users/me`), change-password, sessions list with device rows + `isCurrent` + revoke + logout-others, notification prefs (`GET/PATCH /notifications/preferences`), neutral `publicProfile.enabled` visibility toggle, delete-org with confirm gating (revokes session). Reuses the F2 settings pattern read-only (own `orgAccount.ts`, no edits to `useAccountSettings.ts` or any shared file, either direction).
- New API module `lib/api/orgAccount.ts` + hook file `hooks/useOrgAccount.ts`: one typed function per consumed endpoint; catalogs `src/messages/org-account/{en,ar}.json` (+ parity test) under prefix `orgAccount.*` (auto-merge; never touch `src/i18n/request.ts`).
- Out of scope: dossier upload (F3 owns `org/verification-dossier`); admin org management (F15); statute/"Law 12-06"/authority/audit UI (never built); public profile rendering (F18 reads these facts).

## Capabilities

### New Capabilities
- `org-profile`: organization factsheet — full fact-field editing, cover/logo uploads, completion display, annual-report optional link, registryId display.
- `org-settings`: organization account settings — email/phone, password, sessions + logout-others, notification prefs, neutral visibility toggle, delete-org.

### Modified Capabilities
- None (backend contracts consumed as-is; F0 primitives + F2 patterns consumed read-only; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 2 route dirs (`app/[locale]/org/profile`, `app/[locale]/org/settings`), 1 api module (`lib/api/orgAccount.ts`), 1 hook file (`hooks/useOrgAccount.ts`), 1 message prefix (`orgAccount.*`). No shared, archived, or sibling-file edits.
- Depends on FB (F1/F2/F3 archived); parallel-safe with FD siblings F9–F12 (disjoint route dirs, `orgAccount.ts`/`useOrgAccount.ts`, `orgAccount.*` prefix).
- Backend endpoints consumed (base `/api/v1`): `GET/PATCH /organizations/me`, `GET /organizations/me/profile-completion`, `DELETE /organizations/me`, `PATCH /users/me`, `POST /auth/change-password`, `GET/DELETE /users/me/sessions[/:sessionId]`, `POST /auth/logout-others`, `GET/PATCH /notifications/preferences`, `POST /media/uploads`, `POST /media/:mediaId/confirm`.
