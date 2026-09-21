## Why

Session 1 shipped the cross-cutting foundation but only a deterministic `AuthPlaceholderGuard` seam. No account can exist, authenticate, or be managed yet, so every P1 module (volunteer, organization, opportunities, ...) has nobody to lock resources to. This change delivers the real identity layer — register, login, rotated refresh sessions, email verification, password reset, and `/users/me` — that the rest of the roadmap programs against.

## What Changes

- Add `users`, `sessions`, `verification_tokens` models with the inventory §3 indexes (unique `email`, unique sparse `phone`, TTL on `expiresAt`).
- Add registration+login+refresh+logout+auth-account routes per §2.1 (P2-only routes deferred): volunteer/org register, login, refresh (token rotation + hash storage), logout, verify-email (one-shot token consumption), resend-verification (rate-limited), forgot/reset password (reset revokes all sessions), change-password, `GET /auth/me`.
- Add real JWT access strategy (`@nestjs/passport` + `passport-jwt`) setting `req.user = { sub, role, sessionId }`; replace `AuthPlaceholderGuard`; RolesGuard reads the real `role`; `EMAIL_VERIFICATION_REQUIRED` gate runs in the same guard flow (no publish/apply/submit routes yet).
- Add `/users/me` GET/PATCH/DELETE per §2.2 (soft delete via `status=deleted`; email/phone change re-triggers verification; `role` not settable from the body).
- Add `MailService` interface with providers: `SmtpMailService` (nodemailer, `MAIL_*`), `LogMailService` fallback when `MAIL_HOST` unset, test double. French default, Arabic/French-safe plain-text email.
- Add `RegistrationExtrasService` seam (inert default) so S3/S4/S5 create `volunteer_profiles`/`organizations` without this change coupling to them.
- Tighten throttling on `/login`, `/forgot-password`, `/resend-verification` (rate-limit 429).

## Capabilities

### New Capabilities
- `auth`: registration (volunteer/organization), JWT access + rotated hashed refresh sessions, logout, email verification, forgot/reset/change password, `/auth/me`, MailService providers, EMAIL_VERIFICATION_REQUIRED gate.
- `users`: users model + indexes, `/users/me` GET/PATCH/DELETE with soft delete and re-verification on contact change.

### Modified Capabilities
- `extension-seams`: `AuthPlaceholderGuard` is replaced by the real JWT strategy; a new `RegistrationExtrasService` seam is added with an inert default.

## Impact

- New module trees in `/backend/src/auth`, `/backend/src/users`; `MailService` in `/backend/src/mail`; `RegistrationExtrasService` in `/backend/src/common/seams`.
- New collections: `users`, `sessions`, `verification_tokens`.
- New routes: the §2.1/§2.2 list above (except `/auth/logout-all` and `/users/me/sessions*`, Phase 2).
- New runtime deps: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `nodemailer`; dev deps `@types/passport-jwt`, `@types/nodemailer`.
- Env vars: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (15m), `JWT_REFRESH_TTL` (30d), `EMAIL_VERIFICATION_REQUIRED` (false), `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`.
- Out of scope: `/auth/logout-all`, `/users/me/sessions*`, phone/2FA, OAuth (GitHub/Google login), admin seed script (S17), profile/org models (S4/S5), public visibility.