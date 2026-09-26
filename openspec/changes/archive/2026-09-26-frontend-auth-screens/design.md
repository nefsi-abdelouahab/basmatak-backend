## Context

F0 (`2026-09-25-frontend-foundation`, archived) shipped the shell, theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry (`lib/api/client.ts`), the unified error shape + mapper (`lib/api/errors.ts`), session helpers (`lib/api/session.ts`: `refreshSession`/`getMe`/`logout`), token storage (`lib/auth/storage.ts`), the query-key factory, `useSession.ts` + `getLoginHref(locale, next)`, and system screens including `SessionExpiredScreen` and `RateLimitedScreen`. Verified: `lib/api/auth.ts` and `hooks/useAuth.ts` do not exist yet, so F1 creates them fresh. Constraint: F0 files are archived — F1 consumes them read-only and never edits them. FB siblings F2 (`volunteers.ts`/`useVolunteerAccount.ts`) and F3 (`organizations.ts`/`useOrgOnboarding.ts`) are file-disjoint with F1 by route dir, api module, hook file, and message prefix.

## Goals / Non-Goals

**Goals:**
- Seven auth routes wired to exact v2 endpoints with typed functions + one hook file.
- Guest-continue (`next`) and role-based redirect working for F4+ consumers.
- All auth error states bound to F0's mapper and system screens.

**Non-Goals:**
- Volunteer/org profile content, dossier upload, settings screens (F2/F3).
- New system-screen components, theme/i18n/api-client internals, backend changes.
- Password rules beyond 8–72, admin registration route.

## Decisions

- **New `lib/api/auth.ts` reuses F0 `session.ts` via import for `refresh`/`me`/`logout`; defines only the 9 remaining endpoint functions.** Rationale: roadmap lists 12 functions but 3 already exist in an archived file we must not edit; import-reuse satisfies "one typed function per endpoint" with zero duplication. Alternative (redefine all 12 in `auth.ts`) rejected — duplicate sources of truth for refresh/me/logout.
- **Single `hooks/useAuth.ts` with TanStack Query mutations + `useSessionQuery` reuse for the post-login `GET /auth/me`.** Rationale: one-hook-file-per-session rule; role redirect lives in the login-success handler. Alternative (separate redirect helper module) rejected — unnecessary surface; `getLoginHref` already exists.
- **Routes under `app/[locale]/(auth)/*` as seven page dirs.** Rationale: matches roadmap's route list and keeps the `(auth)` group disjoint from F2 (`volunteer/*`) and F3 (`org/*`). Alternative (flat routes) rejected — breaks section parallel-safety convention.
- **Error binding by code through `mapToApiError`/`errorStateFor`, with per-screen copy for auth-specific states (invalid creds, unverified CTA, token states) and F0 system screens for 401/429/403-variants.** Rationale: roadmap/§C#7 demand reuse, not reinvention. Alternative (auth-local error components) rejected.
- **Validation with zod schemas colocated in `auth.ts` (email, password 8–72, phone regex); server codes treated as source of truth for throttle/suspension/verification states.** Rationale: client validation is UX fast-path only; buckets (login 5/min, forgot/resend 3/hr) are enforced server-side.
- **Message keys under `auth.*` prefix in per-area catalog files.** Rationale: catalog merge-by-prefix ownership keeps FB sessions disjoint.

## Risks / Trade-offs

- [Risk] Overlap between `auth.ts` and F0 `session.ts` confuses ownership → Mitigation: `auth.ts` header documents the 3 reused imports; tasks include a no-duplication grep gate.
- [Risk] `next` param open-redirect → Mitigation: only same-origin relative paths accepted; absolute URLs fall back to role default.
- [Risk] Throttle/registration kill-switch codes differ from fixtures → Mitigation: e2e mocks 429 + 403 variants by code, not message text.
- [Risk] F2/F3 need session/role helpers mid-build → Mitigation: they consume `useSession.ts`/`useAuth.ts` read-only; any change request to F1 files stops and flags.

## Migration Plan

None (greenfield routes; no existing consumers). Rollback = revert the F1 commit; no backend or shared-file changes to unwind.

## Open Questions

1. Role-default landing routes (exact paths for volunteer/org/admin home) — proposed: volunteer `/volunteer/dashboard` (F4), org `/org/dashboard` (F9), admin `/admin/dashboard` (F14); confirm or adjust at implementation.
2. Whether `POST /auth/logout-all` needs any UI in this session (propose: exposed in `auth.ts` + hook only, no screen; F2 settings owns session UI) — confirm.
