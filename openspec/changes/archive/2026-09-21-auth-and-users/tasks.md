## 1. Models and indexes

- [x] 1.1 Add the `users` model (`email` unique, `phone` unique sparse, `passwordHash`, `role`, `status`, `emailVerifiedAt`, `deletedAt`) via the base-schema helper with indexes: unique `email`, unique sparse `phone`, `(role, status)`
- [x] 1.2 Add the `sessions` model (`userId`, `refreshTokenHash` unique, `expiresAt` with TTL index, `createdAt`, `lastUsedAt`) using the base-schema helper
- [x] 1.3 Add the `verification_tokens` model (`tokenHash`, `userId`, `type` email_verify|password_reset, `expiresAt` with TTL index, `consumedAt`) with indexes on `tokenHash` and `(userId, type)`

## 2. Mail service

- [x] 2.1 Install deps: `npm i @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt nodemailer`; dev: `npm i -D @types/passport-jwt @types/nodemailer`
- [x] 2.2 Define the `MailService` interface (`sendVerificationEmail`, `sendPasswordReset`) and a `MailTemplates` helper producing French-default, Arabic/French-safe plain-text bodies from `PUBLIC_BASE_URL`
- [x] 2.3 Implement `SmtpMailService` (nodemailer transporter from `MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`/`MAIL_USER`/`MAIL_PASS`/`MAIL_FROM`; no-op-safe when a field is missing)
- [x] 2.4 Implement `LogMailService` fallback (used when `MAIL_HOST` unset; renders the same body into the app `Logger`) and select the provider at DI from config
- [x] 2.5 Add a `TestMailService` double injectable in `test/` that stores sent messages for assertions

## 3. Auth service and controllers

- [x] 3.1 Implement `UsersService` (create, findByEmail, findById, updateContact, softDelete, set emailVerifiedAt, updatePassword) and register the `users`, `sessions`, `verification_tokens` Mongoose entities in an `AuthModule`
- [x] 3.2 Implement token primitives: 256-bit random token generator, SHA-256 hash util, and TTL helpers (verify 24h, reset 1h, refresh from `JWT_REFRESH_TTL`)
- [x] 3.3 Implement `AuthService.register` (hash password with `bcrypt`, create user, create session + tokens, call `RegistrationExtrasService.createExtras`, send verification email; duplicate email → 409)
- [x] 3.4 Implement `AuthService.login` (`bcrypt.compare`, reject suspended/deleted with 403 `ACCOUNT_SUSPENDED`, create session, return access/refresh/user)
- [x] 3.5 Implement `AuthService.refresh` (hash lookup, verify expiry + user status, rotate: revoke old session + insert new with fresh hash and pushed expiry, return new pair)
- [x] 3.6 Implement `AuthService` logout, verify-email (atomic `findOneAndUpdate` consume, one-shot; replay → 400/410), resend-verification (invalidate prior tokens, issue new), forgot-password (always 204), reset-password (consume token, update hash, revoke all sessions), change-password (compare current, update, revoke other sessions)
- [x] 3.7 Add register/login/refresh/logout/verify-email/resend-verification/forgot-password/reset-password/change-password/me DTOs with class-validator, `whitelist` + `forbidNonWhitelisted`, `role`/`status` never accepted on register/PATCH bodies

## 4. JWT strategy and guards

- [x] 4.1 Register `JwtModule.registerAsync` (access signing from `JWT_ACCESS_SECRET`/`JWT_ACCESS_TTL`/`JWT_REFRESH_SECRET`) with an explicit config check that fails fast when secrets are unset
- [x] 4.2 Implement `JwtStrategy` (passport-jwt, `{ sub, role, sessionId }` → `req.user`) and `JwtAuthGuard` (respects `@Public`, else 401)
- [x] 4.3 Replace `AuthPlaceholderGuard` with `JwtAuthGuard` in `AppModule` APP_GUARD stack (delete the placeholder file and its usages)
- [x] 4.4 Verify `RolesGuard`, `SuspendedGuard`, and `CurrentAccount` read the real `req.user` (`sub`, `role`, `sessionId`); update S1 guard unit tests to use signed test JWTs
- [x] 4.5 Add the `EMAIL_VERIFICATION_REQUIRED` gate check in the guard flow (`EMAIL_NOT_VERIFIED` when enabled and `emailVerifiedAt` unset) with a probe route or dedicated unit test since no publish/apply/submit routes exist yet

## 5. Registration seam

- [x] 5.1 Add `RegistrationExtrasService` (interface + inert default storing nothing) in `src/common/seams/` and expose it from `CommonModule` for DI override by S4/S5

## 6. Users me controller

- [x] 6.1 Add `UsersController` (`GET`/`PATCH`/`DELETE /users/me`) — GET returns the account without password hash; PATCH allows `email`/`phone` only and re-triggers verification on change; DELETE soft-deletes (`status=deleted`, `deletedAt`) and revokes all sessions

## 7. Throttling and env

- [x] 7.1 Apply `@Throttle` overrides to `/login` (e.g. 5/min), `/forgot-password` (3/h), `/resend-verification` (3/h) so excess returns 429 in the error envelope
- [x] 7.2 Update `backend/.env.example` with the session's vars: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (15m), `JWT_REFRESH_TTL` (30d), `EMAIL_VERIFICATION_REQUIRED` (false), `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`

## 8. Tests

- [x] 8.1 Unit tests: token rotation rewrites the session row; refresh token is stored hashed (never raw); login uses `bcrypt.compare`; logout deletes the session; verify consumes the token exactly once; reset revokes all sessions; register rejects duplicate email with 409; role not settable from body
- [x] 8.2 E2E on the S1 replica-set memory-DB rig: volunteer register → verify-email → login → `GET /auth/me` → refresh → logout (old refresh token then rejected); organization register; forgot → reset revokes old sessions; wrong-password throttle returns 429; `EMAIL_VERIFICATION_REQUIRED=true` blocks the gate (unit/guard + probe route)
- [x] 8.3 Run `npm run build && npm run lint && npm test && npm run test:e2e` from `/backend` until all green

## 9. Verification

- [x] 9.1 From the repo root run `openspec validate auth-and-users` (valid) and `openspec status --change auth-and-users` (all artifacts done); then `openspec archive auth-and-users -y`; commit locally only