## 1. Auth API module (API ACCESS + THEME-N/A)

- [x] 1.1 Create `frontend/src/lib/api/auth.ts` with zod schemas (email, password 8–72, phone `/^\+?[0-9]{8,15}$/`) and 9 new typed functions (`register/volunteer`, `register/organization`, `login`, `logout-all`, `logout-others`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `change-password`); reuse `refresh`/`me`/`logout` via import from F0 `session.ts` (do NOT edit it).
- [x] 1.2 Add no-duplication gate: grep confirms no `fetch(`/raw `axios.` in auth code and no redefined `refreshSession`/`getMe`/`logout` outside `session.ts`.

## 2. Auth hook + session wiring (API ACCESS)

- [x] 2.1 Create `frontend/src/hooks/useAuth.ts` (single hook file) with TanStack Query mutations over `auth.ts`, key-factory keys, post-login `GET /auth/me` role redirect, and `next`-param guest-continue (same-origin relative paths only).
- [x] 2.2 Unit-test redirect-target logic (role → landing; `next` honored/rejected) and phone/password validators.

## 3. Auth routes to tokens (THEME + I18N + RESPONSIVE)

- [x] 3.1 Build `(auth)/login` (no role selector; INVALID_CREDENTIALS, unverified-email CTA + resend, ACCOUNT_SUSPENDED, 429 states; links to Create Account + Forgot Password) consuming `components/ui/*` read-only.
- [x] 3.2 Build `(auth)/create-account` selector (volunteer vs org entries, no backend call).
- [x] 3.3 Build `(auth)/register-volunteer` (`{email,password,phone?}` only; auto-login; verification notice + next-step CTA link to F2 profile, not the screen itself).
- [x] 3.4 Build `(auth)/register-organization` (`{email,password,phone?}` only; neutral pending copy + continue CTA to F3 profile-completion; EMAIL_NOT_VERIFIED CTA; no statute/legal fields). DEVIATION recorded: `ORG-<registryId>` NOT shown here — the register response carries no registryId (verified read-only in backend/src/auth) and fetching it needs F3's `GET /organizations/me`; F3 renders it. No fabricated codes.
- [x] 3.5 Build `(auth)/forgot-password` (always-204 neutral copy; 429 state) and `(auth)/reset-password` (token from link; `{token,newPassword}`; invalid/expired/used states; "within one hour" TTL copy; success → Sign In).
- [x] 3.6 Build `(auth)/verify-email` (`{token}` verify + Bearer resend; neutral success + Sign In CTA; org stays pending).
- [x] 3.7 Ship `messages/auth/en.json` + `messages/auth/ar.json` (`auth.*` prefix only); zero hardcoded JSX strings; logical properties only; RTL smoke en↔ar.

## 4. Error-state wiring (reuse F0)

- [x] 4.1 Bind 401 (re-auth CTA → Sign In preserving `next`) and 429 (retry-later) through `mapToApiError`/`errorStateFor` to F0 `SessionExpiredScreen`/`RateLimitedScreen`; no new system components.
- [x] 4.2 E2E (mocked): register→verify-notice→login→me; forgot→reset; expired-token state; throttled-resend 429 state; ar-locale RTL; viewport matrix 1440/1100/390.

## 5. Session gates

- [x] 5.1 From `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green; theme grep gate clean (no hex outside `theme/`); file-disjointness check (only `(auth)/*`, `lib/api/auth.ts` + `auth.test.ts`, `hooks/useAuth.ts` + `useAuth.test.ts`, `messages/auth/*` + `auth-parity.test.ts`, `e2e/auth.spec.ts` touched, plus the approved additive `i18n/request.ts` merge; no F0/F2/F3-owned files edited).
- [x] 5.2 From repo root: `openspec validate frontend-auth-screens` clean; confirm tree contains only this session's files before any commit.
