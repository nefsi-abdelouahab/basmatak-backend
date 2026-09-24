# backend-v2-org-ops — Tasks

## 1. Session device metadata (schema + capture)

- [x] 1.1 Add fields to `backend/src/auth/schemas/session.schema.ts`: `device` (optional sub-document `{ browser?, os?, device? }`, default `null`) and `userAgent` (optional `String`, trimmed, `maxlength` 512).
- [x] 1.2 Create `backend/src/auth/session-device.util.ts`: a self-contained `parseUserAgent(raw: string | undefined): { device: { browser; os; device } | null; userAgent: string | null }` using ordered browser/OS/device heuristics; returns `device: null` on absent/unparseable headers. No new dependency.
- [x] 1.3 Thread `userAgent` through `AuthService.issueSession` and capture it in `login()` and `register()` (read `req.headers['user-agent']` in `AuthController` and pass into the service calls; `getAuthTokens`-equivalent helpers updated if present).
- [x] 1.4 Preserve metadata on refresh rotation: when `refresh()` creates the replacement session row, copy `device`/`userAgent` from the rotated row (design D3).

## 2. isCurrent + sessions list payload

- [x] 2.1 Extend `AuthService.listSessions(userId, currentSessionId)` to select `device userAgent` and return `{ id, createdAt, expiresAt, lastUsedAt, device, userAgent, isCurrent }` with `isCurrent = session._id.toString() === currentSessionId` (never stored).
- [x] 2.2 Update `backend/src/users/users.controller.ts` `GET /users/me/sessions` to pass `account.sessionId` into `listSessions`.

## 3. logout-others + revocation helper

- [x] 3.1 Add `AuthService.revokeAllExcept(userId, sessionId)`: `sessionModel.deleteMany({ userId, _id: { $ne: new Types.ObjectId(sessionId) } })`.
- [x] 3.2 Add `POST /auth/logout-others` in `backend/src/auth/auth.controller.ts` (Auth, `@HttpCode(NO_CONTENT)`), calling `revokeAllExcept(account.sub, account.sessionId)`.

## 4. Last activity tracking

- [x] 4.1 Add `lastActivityAt` (optional `Date`) to `backend/src/users/schemas/user.schema.ts`.
- [x] 4.2 Add `UsersService.touchLastActivity(userId, now?)` doing the throttled conditional update (design D4): `updateOne({ _id: userId, $or: [{ lastActivityAt: null }, { lastActivityAt: { $lte: now - 15min } }] }, { $set: { lastActivityAt: now } })`.
- [x] 4.3 Initialize `lastActivityAt` on session issue (login/register set it via `touchLastActivity` on the user).
- [x] 4.4 Wire the touch on own-account reads `GET /users/me` and `GET /auth/me`; include `lastActivityAt` in the own-account payload (`UserPayload`).

## 5. Unit tests

- [x] 5.1 `backend/src/auth/session-device.util.spec.ts` (or fold into `auth.service.spec.ts`): UA→device mapping for a desktop Chrome, an Android Chrome, an iPhone/Safari, and an absent header (→ `device: null`).
- [x] 5.2 `AuthService` unit tests: `listSessions` sets exactly one `isCurrent` (matching the passed `currentSessionId`); refresh copies `device`/`userAgent` to the replacement row; `revokeAllExcept` deletes all rows but the current one.
- [x] 5.3 `UsersService` unit test: `touchLastActivity` throttles (second call within 15 min does not write; call after the window writes).

## 6. E2E tests

- [x] 6.1 `test/auth.e2e-spec.ts` (or dedicated session e2e): login twice with different `User-Agent` headers; `GET /users/me/sessions` returns two rows with `device`/`userAgent` and exactly one `isCurrent: true`.
- [x] 6.2 Logout-others e2e: after `POST /auth/logout-others` the current session still works; a refresh token from the revoked session is rejected (`401`); single-session call returns `204`.
- [x] 6.3 Foreign isolation e2e: a second user's token cannot list the first user's sessions (empty/own-only result).
- [x] 6.4 `lastActivityAt` e2e: after login and an account read, `GET /users/me` includes `lastActivityAt`; the throttle keeps repeated reads from rewriting within the window.

## 7. Verification

- [ ] 7.1 Run `npm run build`, `npm run lint`, `npm test`, and `npm run test:e2e` in `backend/`; confirm all green. (BLOCKED: `npm run build` and the full suites are held up by backend-v2-registry-ids WIP in this shared working tree — `common/counters/counters.schema.ts` TS2416, `scripts/backfill-registry-ids.ts` TS2352, and ctor-arity breaks in 4 spec suites. My scoped unit specs and `test/auth.e2e-spec.ts` (20/20, incl. 6 org-ops tests + hermetic mail harness fix resurrecting the throttle test) are green.)
- [ ] 7.2 Repo root: `openspec validate backend-v2-org-ops` and `openspec status --change backend-v2-org-ops`.