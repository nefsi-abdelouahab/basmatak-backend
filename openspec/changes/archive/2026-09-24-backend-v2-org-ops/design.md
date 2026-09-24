# backend-v2-org-ops — Design

## Context

The Organization Settings screens (and the admin volunteer rows) surface session/device rows and last-activity that the API does not currently produce. Today `sessions` stores only `{ userId, refreshTokenHash, expiresAt, lastUsedAt?, rotatedAt? }`, the auth service creates and rotates sessions without any device context, and `users` has no last-activity timestamp. This change adds the missing metadata, the two settings-screen affordances (`isCurrent` marker, "sign out of all other sessions"), and the reusable revocation helper that the later account-deletion flow (`DELETE /organizations/me`, org-facts Session 11) consumes.

Owner modules: `auth` (`sessions`) and `users` (`users`). S1 peer sessions touch disjoint module directories; nothing here collides with `backend-v2-registry-ids` or other S1 sessions.

## Goals / Non-Goals

**Goals:**
- Capture `device`/`userAgent` on session creation (login and registration) with a self-contained parser; preserve it across refresh rotation.
- Derive `isCurrent` server-side (JWT `sessionId` claim match) on `GET /users/me/sessions` — never stored.
- Add `POST /auth/logout-others` that revokes every session except the current one, plus a reusable `revokeAllExcept(userId, sessionId)` helper.
- Track `users.lastActivityAt` with throttled, cheap guarded writes and expose it on the own-account payload.
- No new runtime dependency, no change to `POST /auth/login`'s body, no route or field removals.

**Non-Goals:**
- Geo/IP capture (explicitly dropped per the plan — "geo optional").
- `DELETE /organizations/me` itself (org-facts, Session 11; this session only ships the revocation helper).
- Seeding device data for pre-existing sessions (old rows simply have `device: null`).
- Admin display of `lastActivityAt` (admin-lists Session 10 reads the field; nothing to build here).

## Decisions

**D1 — UA parsing: self-contained heuristic parser, not `ua-parser-js`.**
A small `session-device.util.ts` maps common browser/OS/device fingerprints from the raw `User-Agent` via ordered regex/contains checks to `{ browser, os, device }`, defaulting to `null` when nothing matches. The roadmap explicitly prefers this over adding a package.
*Alternatives considered:* `ua-parser-js` (accurate but adds a dependency and its bundle to a free-tier app that needs only coarse buckets); storing the raw header only (cheapest, but the settings screen renders browser/OS/device columns). Chosen: raw header stored **and** a best-effort parsed object, so the UI is never blocked by parser misses.

**D2 — `isCurrent` derived at read time, never stored.**
`listSessions(userId, currentSessionId)` compares each row's `_id` against the access token's `sessionId` claim and returns `isCurrent: true` for exactly one row. Storing the flag would go stale the moment another device logs in unless rewritten on every request.
*Alternatives considered:* persist `isCurrent` and rewrite on every access (extra writes, staleness window); deliver offset-based math client-side (rejected — plan says "derivable server-side"). Chosen: derive per read.

**D3 — Refresh rotation copies metadata from the rotated row.**
Rotation inserts a brand-new session row; re-parsing headers at refresh time risks empty metadata (native clients and some proxies strip `User-Agent`), so the replacement row copies `device`/`userAgent` from the consumed row.
*Alternatives considered:* re-parse `req.headers['user-agent']` at refresh (device-consistent but lossy); leave new rows empty (breaks the device list after a refresh). Chosen: copy from the rotated row.

**D4 — `lastActivityAt` via atomic, throttled conditional update.**
`UsersService.touchLastActivity(userId, now)` issues
`updateOne({ _id, $or: [{ lastActivityAt: { $lte: cutoff } }, { lastActivityAt: null }] }, { $set: { lastActivityAt: now } })`
with `cutoff = now - 15min`. This is a single conditional write, no read-before-write, and naturally rate-limits to ≤1 write per user per 15 minutes. It is invoked from the own-account read routes (`GET /users/me`, `GET /auth/me`) and initialization happens at login/registration (the session write already touches the user).
*Alternatives considered:* a guard on every authenticated route (too hot); a plain unconditional `$set` on every read (writes per request). Chosen: conditional single write on account reads.

**D5 — Revocation helper shape.**
`AuthService.revokeAllExcept(userId, sessionId)` = `sessionModel.deleteMany({ userId, _id: { $ne: new Types.ObjectId(sessionId) } })`. `POST /auth/logout-others` calls it and returns `204` (idempotent). The same helper is what org-facts reuses for account deletion.
*Alternatives considered:* reusing `logoutAll` minus a manual re-issue of the current session (unnecessary session churn). Chosen: single targeted `deleteMany`.

**D6 — Scope of writes to the schema.**
`sessions` gains `device: { browser?, os?, device? } | null` and `userAgent?` (both optional — existing rows and seeded data stay valid). `users` gains `lastActivityAt?`. The login DTO is unchanged.

## Risks / Trade-offs

- **Heuristic UA parse is imperfect** → store the raw `userAgent` alongside; `device: null` when unknown; the UI degrades gracefully. Status quo on most SaaS session lists.
- **`isCurrent` trusts the JWT `sessionId` claim** → the claim is already minted server-side at issue time and unchanged throughout token life; guards already rely on it, so no new trust is introduced.
- **`lastActivityAt` can lag by up to 15 min** → that is the accepted trade-off for zero per-request writes; the settings/admin screens render "last active" with the same cadence as every major product.
- **New schema fields overlap no S1 peer module** → `session.schema.ts` and `user.schema.ts` belong to auth/users; verified disjoint from `registry-ids` (core+vol/org/opp/verif).

## Migration Plan

- No data migration needed: fields are optional, additive (`device: null` for pre-existing sessions; `lastActivityAt` absent until first access). TTL indexes and rotation semantics unchanged.
- Rollback: revert the four additive edits (schemas, service, controller, users helper); existing rows and routes degrade cleanly since nothing removes prior fields.

## Open Questions

- None blocking. The `lastActivityAt` display on admin lists is owned by admin-lists (Session 10); the field format here is a plain ISO timestamp.