# backend-v2-org-ops

## Why

The Organization Settings screens render a sessions/devices list and an "Active Today" marker, but the backend stores no device metadata on `sessions`, tracks no last-activity on `users`, and cannot revoke every session except the current one — the screens would be built against fabricated data. This change captures `device`/`userAgent` at login, tracks `users.lastActivityAt`, adds `POST /auth/logout-others`, enriches `GET /users/me/sessions` with device info + a server-derived `isCurrent`, and ships the session-revocation helper that `DELETE /organizations/me` (org-facts, Session 11) later reuses.

## What Changes

- `sessions` add `device` (`{browser, os, device}` parsed from the `User-Agent` header via a small self-contained parser — no dependency) and the raw `userAgent` string, captured on login and left untouched by refresh rotation.
- `GET /users/me/sessions` (Auth) payload gains the new metadata plus a server-derived `isCurrent` flag: true only for the row whose `_id` equals the access token's `sessionId` claim. `isCurrent` is computed at read time, never stored.
- New `POST /auth/logout-others` (Auth): deletes every `sessions` row for the caller except the current one (identified by `sessionId`). The current session and its bearer remain valid.
- New `AuthService.revokeAllExcept(userId, sessionId)` helper — reused later by `DELETE /organizations/me` (org-facts). All-additive, so existing `logout`/`logout-all` semantics are unchanged.
- `users` add `lastActivityAt`, touched on authenticated account reads; writes throttled to at most once per 15 minutes per user. Exposed in `GET /users/me`; admin-lists (S10) only reads later.
- `POST /auth/login`'s request shape is unchanged (metadata comes from headers); the frontend `login` call is untouched.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `auth`: session creation captures device metadata from the `User-Agent` header (fields on the `sessions` row); refresh rotation preserves that metadata on the new row; the own-sessions payload (`GET /users/me/sessions`) carries the device columns plus a server-derived `isCurrent`; new authenticated `POST /auth/logout-others` revokes every session except the current one — all additive.
- `users`: `users.lastActivityAt` tracked on authenticated reads (guarded, ≥15 min throttle) and surfaced in the own-account payload; all-additive.

## Impact

- `backend/src/auth/schemas/session.schema.ts` — `device`, `userAgent` fields.
- `backend/src/auth/auth.service.ts` — capture at `issueSession`/login; `listSessions` projection + `isCurrent`; `revokeAllExcept` + `logoutOthers`.
- `backend/src/auth/auth.controller.ts` — `POST /auth/logout-others`.
- `backend/src/users/schemas/user.schema.ts` — `lastActivityAt`.
- `backend/src/users/users.service.ts` — `lastActivityAt` touch helper (guarded, throttled) + payload exposure.
- A tiny self-contained UA parser (no package added; `ua-parser-js` not required).
- Tests: `auth.service.spec.ts`, `users.service.spec.ts`, session/auth/users e2e specs. No schema/route removals; no new dependency; no change to the login DTO.