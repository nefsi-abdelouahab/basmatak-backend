## Context

Session 1 shipped the cross-cutting core (`common-core`, `status-transitions`, `audit-logging`, `system-settings`, `internal-jobs`, `extension-seams`) with an `AuthPlaceholderGuard` that injects a deterministic `req.token` placeholder (sub `000000000000000000000000`, role `volunteer`). Every later session needs real accounts: Session 2 replaces the placeholder with a real JWT strategy, adds the `users` lifecycle (`/users/me`), and the auth flows from inventory §2.1/§2.2. Constraint set is unchanged: single-instance Render free (in-memory throttler correct), no Redis/queues/SMS, `mongodb-memory-server` replica-set test rig, global prefix `/api/v1`, error envelope `{ statusCode, code, message, details? }`, DTO validation with `whitelist` + `forbidNonWhitelisted`. Admin seed script is Session 17; org/profile models are S4/S5; `/auth/logout-all` + `/users/me/sessions*` are P2.

## Goals / Non-Goals

**Goals:**
- Real identity: `users` + `sessions` + `verification_tokens` models with the inventory §3 indexes; TTL cleanup (no cron).
- JWT access strategy (`@nestjs/passport` + `passport-jwt`) setting `req.user = { sub, role, sessionId }`, replacing the `AuthPlaceholderGuard` globally; `RolesGuard` now validates against the real token role.
- Full §2.1/§2.2 non-P2 route set: register volunteer/org, login, refresh (rotation + hashed storage), logout, verify-email, resend-verification, forgot/reset/change-password, `GET /auth/me`, `GET/PATCH/DELETE /users/me`.
- `EMAIL_VERIFICATION_REQUIRED` gate in the guard flow (later publish/apply/submit; probed by a test route/unit test now).
- `MailService` behind an interface: `SmtpMailService` (nodemailer, `MAIL_*`), `LogMailService` fallback, test double. French default, plain text, Arabic/French-safe.
- `RegistrationExtrasService` seam (inert default) so S3/S4/S5 hook in `volunteer_profiles` / `organizations` creation later.
- Rate limits tightened on `/login`, `/forgot-password`, `/resend-verification`.

**Non-Goals:**
- No `/auth/logout-all`, no `/users/me/sessions*` (P2/S13).
- No admin registration/seed (S17), no profile/org models (S4/S5), no public-visibility logic.
- No phone/2FA, no OAuth (GitHub/Google login), no email-sending test against a real Brevo account (uses test double / logger).

## Decisions

### D1. `users` carries identity only; profiles belong to later sessions
`users`: `email` (unique), `emailVerifiedAt`, `phone` (unique sparse), `passwordHash`, `role` (`volunteer|organization|admin`), `status` (`active|suspended|deleted`, default `active`), `deletedAt`, `lastLoginAt`? — no. Profile fields (names, bio, birthDate, username) stay out; S4/S5 own them. Indexes: unique `email`, unique sparse `phone`, `(role, status)`. Rationale: inventory §3 defines `users` as the identity collection and `volunteer_profiles`/`organizations` as the profile carriers; coupling now would force S2 to re-migrate. Alternative rejected: embedding profile fields — blurs ownership and breaks the "one collection one owner" rule.

### D2. Refresh + access split with rotation, hash storage
`POST /auth/login` returns `{ accessToken, refreshToken, user }`. The refresh token is a fresh 256-bit random (crypto) value whose SHA-256 hash is stored in `sessions` (`userId`, `refreshTokenHash` unique, `expiresAt` TTL, `createdAt`, `lastUsedAt`, `userAgent`?). Each `POST /auth/refresh` receives the raw refresh token, hashes it, looks up the session, verifies expiry and that the user is not suspended/deleted, then **rotates**: deletes the old session row and inserts a new session with a fresh token hash + pushed expiry. The old (now-deleted) session row makes replay 401. Access JWT carries `{ sub, role, sessionId }`, TTL `JWT_ACCESS_TTL` (15m). Rationale: rotation + short-lived access = standard OWASP refresh-token advice and matches inventory §0 "rotated on refresh, stored hashed". Alternative rejected: storing plaintext or JWT refreshes — a DB leak would mint tokens forever.

### D3. Guard stack: JWT strategy replaces the placeholder seam
Register `JwtStrategy` (from `JwtModule.registerAsync` + `passport-jwt`), a `JwtAuthGuard` (extends `AuthGuard('jwt')`, also applies `Public` skip) used as `APP_GUARD` in `AppModule`, replacing `AuthPlaceholderGuard`. `req.user = { sub, role, sessionId }`; `CurrentAccount` decorator now reads `req.user`. `RolesGuard` (unchanged contract) checks `req.user.role`. `SuspendedGuard` loads the user by `sub` and rejects `suspended`/`deleted` (403 `ACCOUNT_SUSPENDED`). Email-verification gate: a small `EmailVerifiedGuard` (or a check inside the composed guard) enforces `EMAIL_VERIFICATION_REQUIRED=true` ⇒ `users.emailVerifiedAt` must be set; no rule-carrying routes exist yet, so behavior is pinned by a unit test + a probe route. Rationale: S1 composed guards so S2 only swaps the identity source. Alternative rejected: keeping the placeholder and bolting JWT as a second guard — two identity sources drift.

### D4. Email flows are one-shot token claims via `verification_tokens`
`verification_tokens`: `tokenHash` (SHA-256 of a 256-bit random), `userId`, `type` (`email_verify | password_reset`), `expiresAt` (TTL index, 24h for verify / 1h for reset), `consumedAt`. Verify/reset consume in a single `findOneAndUpdate({ consumedAt: null, expiresAt: { $gt: now } }, { consumedAt: now })` — atomic, one-shot; replay returns 400/410. `/auth/resend-verification` invalidates prior verify tokens for that user (set `consumedAt`) and issues a new one; it and `/forgot-password` always return 204 (account enumeration). `/reset-password` revokes **all** the user's sessions (delete many) after consuming the token. Rationale: TTL + one-shot handles cleanup without cron and matches inventory §3 TTL notes. Alternative rejected: storing raw tokens — DB leak would let anyone verify/reset.

### D5. `MailService` interface + three providers
`MailService` exposes `sendVerificationEmail(to, { token/url })`, `sendPasswordReset(to, { token/url })` (welcome deferred). `SmtpMailService` (nodemailer, `MAIL_HOST` set) builds French-default, Arabic/French-safe **plain-text** messages (no HTML) with `MAIL_FROM`; `LogMailService` (used when `MAIL_HOST` unset) renders the same body into the Nest logger — dev parity without an SMTP server; test double in `test/`. Provider selected at DI by config. Rationale: inventory §10 picks Brevo SMTP with free fallbacks and the interface is mandated by the roadmap. Alternative rejected: a concrete nodemailer class directly — no test seam, breaks the "interface behind the provider" convention.

### D6. Register creates only identity; profile creation is a seam
`POST /auth/register/volunteer|organization` validates DTO, `bcrypt.hash` the password, creates the `users` row, immediately creates a session + issues tokens (login after register is not required but the response is symmetric), and creates an `email_verify` token + sends email. It then calls `RegistrationExtrasService.createExtras(user, dto)` — an interface + inert default that stores nothing; S4 (volunteer) and S5 (organization) swap in providers that create `volunteer_profiles` / `organizations` (`userId` unique per inventory §7). Register DTO accepts no `role`/`status` fields (`forbidNonWhitelisted` enforces). Rationale: same seam convention as S1 (interface + inert default in `src/common/seams/`); keeps S2 decoupled from profiles while making register complete. Alternative rejected: creating profiles now — out of scope and forbidden by session ordering.

### D7. Per-route throttle tightening
`@Throttle` on `/login` (e.g. 5/min), `/forgot-password` (3/h), `/resend-verification` (3/h) on top of the global `THROTTLE_LIMIT`; 429 uses the error envelope. Rationale: brute-force and enumeration cost. Alternative rejected: offloading to external service — free-tier constraint.

### D8. `/users/me` semantics
`GET /users/me` returns the account (id, email, emailVerifiedAt, role, status, createdAt) + `own organization` when role is organization (resolved by `organizations.userId`, S5 fills it). `PATCH /users/me` allows `email`/`phone`/`password`-only (changing password goes through `change-password`; role never settable); changing `email` or `phone` sets `emailVerifiedAt: null` and triggers a new verification token + email. `DELETE /users/me` soft-deletes: `status=deleted`, `deletedAt`, and revokes all sessions. Rationale: inventory §2.2 + soft-delete convention (§0). Alternative rejected: hard delete — violates `.gitignore`-wide soft-delete convention and breaks audit history.

## Risks / Trade-offs

- [Placeholder→JWT swap breaks S1 guard unit tests] → Mitigation: S1 tests asserting placeholder identity are updated to build real signed JWTs via a `TestApp`-bound secret; `AuthPlaceholderGuard` file is deleted with the seam spec update.
- [Rotation/lookup race on concurrent refreshes] → Mitigation: refresh is idempotent by deleting-then-inserting keyed on the token hash; concurrent use of the same token yields exactly one new session and one 401 (race acceptable, replay is the point).
- [Real SMTP unavailable in CI] → Mitigation: tests inject the test double; `LogMailService` covers local dev; `SmtpMailService` accepts unset `MAIL_*` without crashing.
- [Email enumeration via verify/resend timing] → Mitigation: identical 204 responses and timing-neutral paths for existent/non-existent accounts on rate-limited endpoints.
- [TTL-expired sessions/tokens linger until Mongo's sweeper] → Mitigation: accepted; TTL index is the documented cleanup mechanism (inventory §0), no cron exists by design.
- [JWT secret in repo] → Mitigation: `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` only via env; `.env.example` blanks; guard tests use test-only secrets.

## Migration Plan

No data migration (new collections). Rollback = drop this change's commit; only S3+ depend on it and the roadmap orders strictly. Operational: `.env.example` gains this session's vars; existing `.env` needs the two JWT secrets set or `JwtModule` will fail fast at boot (guarded by an explicit config check). S1's `AuthPlaceholderGuard` is removed and the `extension-seams` spec delta records the swap.

## Open Questions

- None blocking. (Brevo API-key vs SMTP relay: SMTP-only for MVP per inventory §10; revisit when a dashboard/admin session lands.)