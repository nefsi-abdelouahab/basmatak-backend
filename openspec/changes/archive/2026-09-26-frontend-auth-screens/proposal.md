## Why

The F0 foundation (shell, theme, i18n, API client, system screens) is archived, but the app has no auth routes: guests cannot sign in, register, recover passwords, or verify email. Session F1 (roadmap §4, Section FB) builds all auth screens against the frozen v2 backend contract.

## What Changes

- ADDED seven auth routes under `app/[locale]/(auth)/`: `login`, `create-account`, `register-volunteer`, `register-organization`, `forgot-password`, `reset-password`, `verify-email`.
- ADDED `src/lib/api/auth.ts` (new auth-specific module; F0's `session.ts`/`client.ts`/`errors.ts` consumed read-only, never edited) with one typed function per auth endpoint.
- ADDED `src/hooks/useAuth.ts` (this session's single hook file) wrapping the auth functions via TanStack Query, including role-based post-login redirect via `GET /auth/me` and `next`-param guest-continue flow (decision 10).
- ADDED `auth` message-key prefix in per-area catalogs (`en`+`ar`); wired `INVALID_CREDENTIALS`, unverified-email CTA, `ACCOUNT_SUSPENDED`, invalid/expired/used tokens, and 429 `RATE_LIMITED` to F0's error-code mapping and system screens.
- Registration stays minimal (`{email, password, phone?}`); org post-creation shows neutral pending copy + `ORG-<registryId>`; no role selector on Sign In; no admin registration route.

## Capabilities

### New Capabilities
- `frontend-auth-screens`: all auth routes, auth API module, auth hook, guest-continue entry, and auth error-state bindings described above.

### Modified Capabilities
- None. F0 capabilities (`frontend-api-client`, `frontend-i18n`, `frontend-shell`, `frontend-theme`, `frontend-ui-primitives`) are consumed read-only.

## Impact

- Frontend only: `frontend/src/app/[locale]/(auth)/*`, `frontend/src/lib/api/auth.ts`, `frontend/src/hooks/useAuth.ts`, `frontend/src/messages/auth/*`.
- No changes to `/backend`, `backend-inventory.md`, `docs/API.md`, F0 shared primitives (`components/ui/*`, theme, i18n setup, api client internals), or any archived change.
- Scope note: this session follows roadmap §4 "Session F1" exactly (both registration forms in scope). The session prompt's reminders suggested deferring the Volunteer form to F2 and the org form to F3; the roadmap text governs per the prompt's own conflict rule, so both forms ship here and F2/F3 own profile content, dossier upload, and settings.
