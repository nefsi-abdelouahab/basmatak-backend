# Design — security-performance (Session 19)

## Context

ROADMAP Session 19 (lines 858+) is the hardening pass: throttling, header/CSP tuning, secret hygiene, signed-URL lifetimes, refresh-replay detection, `explain()`-proven query plans, compound indexes, and N+1 batching. The base specs are the current source of truth; this change only touches what the roadmap explicitly scopes. Existing code was audited before writing these decisions (constant-time jobs compare already present; auth/media throttles already stricter than global; `POST /reports` has no throttle; Supabase signed-URL TTL is currently 3600s; refresh rotation currently replaces the old row with no reuse detection).

## Decisions

### D1 — Throttler: global defaults + stricter per-route overrides

- Global defaults come from `THROTTLE_TTL` (default `60`) / `THROTTLE_LIMIT` (default `100`), wired in `backend/src/app.module.ts` `ThrottlerModule.forRoot`.
- Already stricter (verified, no change needed): `login` 5/60s, `forgot-password`/`resend-verification` 3/3600s in `backend/src/auth/auth.controller.ts`; `upload`/`link` 20/60s, `confirm` 60/60s in `backend/src/media/media.controller.ts`.
- **New**: `POST /reports` gets a stricter per-route `@Throttle` (e.g. 5/60s) in `backend/src/reports/reports.controller.ts`.
- Alternative considered: single per-endpoint-only config (rejected — global default is the safety net).

### D2 — Helmet + CSP, Swagger gated to non-prod

- `helmet()` in `backend/src/main.ts` keeps the strict defaults; when Swagger is served the CSP is relaxed only enough for Swagger UI assets (self + the CDN origins Swagger 7.x loads from). Production responses always use the strict CSP.
- Swagger is initialized only when `SWAGGER_ENABLED=true` **and** `NODE_ENV !== 'production'`.
- Alternative considered: dropping Swagger entirely in all environments (rejected — dev/prod-off dev-docs are the point of the flag).

### D3 — Secret hygiene

- No new logging of secrets exists; the risk is future/debug logging. Enforcement is a grep audit over `console.log`/`logger.*` interpolations containing `process.env` and a boot-time assertion test that boot logs with sentinel secret values contain no sentinel strings.
- Alternative considered: a runtime redacting logger wrapper (rejected — scope creep; the roadmap asks for an audit + tests).

### D4 — Signed URL TTL ≤ 15 minutes

- `SupabaseStorageProvider.SIGNED_URL_TTL_SECONDS` changes `3600 → 900` (`backend/src/media/storage/supabase-storage.provider.ts`).
- The Supabase SDK's `createSignedUploadUrl` exposes no expiry knob (verified against supabase-js ^2.116.0): the upload token TTL is documented at the contract level in the `StorageProvider` interface and asserted in a unit test that the read-URL path passes `900`.
- `UploadIntent.expiresAt` remains unused (reserved for a future pre-signing flow).
- Alternative considered: 60s TTLs (rejected — breaks multi-tab/queued uploads; 15 min is the roadmap bound).

### D5 — Link allowlist semantics

- Rule: scheme must be `http(s)`; host must equal an allowlist entry **or** be a subdomain (`host === entry || host.endsWith('.' + entry)`), except `youtu.be` which is exact-match only. Existing `assertAllowedLinkHost` in `backend/src/media/media.constants.ts` already implements the suffix rule; the only code change is the `youtu.be` exactness.
- Unit bypass attempts added to `backend/src/media/media.constants.spec.ts`: `youtube.com.evil.com`, `evil-youtube.com`, `youtu.be.evil.com`, `javascript:`, `ftp://`, `not-a-url`, plus `www.youtube.com` (accepted).

### D6 — Refresh-token reuse detection

- Schema (`backend/src/auth/schemas/session.schema.ts`): add `rotatedAt?: Date`; keep the unique `refreshTokenHash` index; keep the `expiresAt` TTL index (`expires: 0`).
- Rotation flow in `backend/src/auth/auth.service.ts` `refresh()`:
  1. Hash the presented token; `findOneAndUpdate({ refreshTokenHash: hash, rotatedAt: null }, { $set: { rotatedAt: now } }, { new: false })` — atomic claim; the pre-image tells us whether the row was live (`null` → claim won; a document → reuse).
  2. Claim won → validate `expiresAt` + user status, insert the new session (hash + pushed expiry), return the pair.
  3. Reuse detected (pre-image non-null, or matched row already has `rotatedAt`, or matched row of a suspended/deleted user is replayed) → `deleteMany({ userId })` for that session's user, throw `401 REFRESH_TOKEN_REUSE_DETECTED` (UPPER_SNAKE business code, error envelope).
  4. `listSessions` filters `rotatedAt: null` so tombstones never surface.
- Expired row → still `401` with the existing "invalid or expired" code (no user-suspicion signal on benign expiry).
- TTL keeps the tombstone rows bounded — no manual cleanup job; the roadmap's "TTL cleanup soak" is covered by asserting the TTL index declaration (`schema.path('expiresAt').options.index.expires === 0`) plus the expired-token rejection test, since the MongoDB TTL monitor's default 60s cadence makes a wall-clock deletion soak impractical in the test rig (`backend/test/utils/test-db.ts` memory replset has no `ttlMonitorSleepSecs` passthrough).
- Existing test `rotates the session on refresh and rejects the old refresh token` in `backend/src/auth/auth.service.spec.ts` is updated: the old hash row still exists but with `rotatedAt` set, replay rejects with `REFRESH_TOKEN_REUSE_DETECTED`, and the user's remaining sessions are gone.
- Alternative considered: hard-delete on rotation (rejected — no tombstone means no reuse detection signal, which is the whole point).

### D7 — Index review (F11 canonical decision recorded here)

Per the roadmap's canonical decision, the feed keyword search uses `$regex` **bounded by an early `categoryId` equality**, geo filtering uses the indexed `location` equality fields, and the text index stays **defined but reserved** (no query references it).

Additions/changes:

| Collection | Index | Serves | Change |
|---|---|---|---|
| `opportunities` | `(status, categoryId)` | feed + `categoryId` bound | **add** |
| `opportunities` | `(status, location.wilayaId)` | feed geo (wilaya) | **add** |
| `opportunities` | `(status, location.municipalityId)` | feed geo (municipality) | **add** |
| `volunteer_profiles` | `(publicProfile.enabled, location.municipalityId)` | talents feed | **add**; **drop** the lone `publicProfile.enabled` single (prefix-equivalent; keeps `explain()` assertions deterministic when duplicate leading-key indexes would otherwise exist) |
| `submissions` | `(organizationId, status)` | gate counting distinct + reliability `find({ organizationId })` | **add** |

- In-memory `_id:-1` sort on the feed remains (≤21 candidate docs post-filter) — acceptable at MVP scale; noted as future work.
- The platform-wide reviews scan in reliability (`find({ status: { $ne: 'hidden' } })`) stays unindexed per the reviews spec ("no additional index is required for the hide flag") and is accepted for MVP scale.
- `explain()` assertions run via a small helper that executes `collection.find(filter).explain('executionStats')` (and `explain` on the distinct command for the gate) and asserts the winning plan touches the intended index and does not include a `COLLSCAN` stage. Assertions avoid picking a specific *index name* where a choice exists — they assert `indexName` of the intended key pattern or, at minimum, presence of the intended index + absence of `COLLSCAN`, to stay stable if Mongo picks a sibling `(status, …)` index.
- Index creation in the test rig is awaited via `Model.init()` before assertions (Mongoose builds indexes asynchronously on first connection).

### D8 — Talents N+1 batching

- `mapTalentCards` in `backend/src/volunteers/volunteers.service.ts` currently awaits `loadPublicSkills` per profile. Change: collect all profile `_id`s for the page, run **one** `volunteer_skills` `$in` query for the page, then one `skills` catalog `$in` for the distinct skill ids, then group in memory. Avatar/media lookups were already batched; no change there.
- The batched path keeps identical card output (existing talent tests must stay green); the new test asserts bounded query count by spying on the model's `find`/`countDocuments` calls for the page.

### D9 — Audit-only posture checks (no behavior change expected)

- Constant-time jobs-key compare: `timingSafeEqual` in `backend/src/core/jobs/jobs-key.guard.ts` — **verified already present**; add/extend a unit test asserting unequal-length keys don't throw and equal keys pass, and that the guard never short-circuits on length mismatch before hashing (guard hashes inputs first — keep as-is).
- Audit sensitive-actions list (`audit.interceptor.ts`): matches inventory §0 (`PATCH`/`DELETE` on org/volunteer resources, admin routes, gate/reliability/etc. writes) — **no spec delta**; extend `audit-coverage.spec.ts` if the §0 list is not yet fully asserted.
- ObjectId/CastError: a global exception filter (or reuse of the existing envelope path) maps `CastError` → `400 INVALID_ID` (UPPER_SNAKE) instead of a 500/stack leak; verified with a route accepting a malformed `:id` param.
- DTO whitelist: confirm `ValidationPipe({ forbidNonWhitelisted: true, whitelist: true })` is global in `main.ts`; add a test that a stray unknown field on a known DTO is rejected with `400`.
- Error codes: confirm all business codes reached from this change are UPPER_SNAKE (`REFRESH_TOKEN_REUSE_DETECTED`, `LINK_HOST_NOT_ALLOWED`, `PUBLISH_GATE_LOCKED`, `INVALID_ID`).

### D10 — Load smoke (optional)

A small script/seed loop writes >50 opportunities + profiles, then hits `GET /opportunities?limit=50` and `GET /talents?limit=50`, asserting a full page is returned with `next` cursor present and no 5xx. Runs as a normal e2e test (seed helper already exists in `backend/test/helpers/seed-utils.ts`); kept as its own task so it can be descoped if time runs short.

## Risks & Trade-offs

- **Reuse detection revokes all sessions**: correct security behavior, but a stolen-then-replayed token logs out every device. Documented in the spec scenarios; acceptable (that's the point).
- **Tombstones retained until TTL**: slightly more `sessions` rows than before (one per consumed refresh). Bounded by refresh TTL; negligible storage.
- **More `(status, …)` indexes on `opportunities`**: three new compounds cost write amplification on a collection whose writes are rare relative to reads. Accepted on the free-tier envelope; the redundant single `publicProfile.enabled` drop offsets one of the adds elsewhere.
- **`explain()` assertions can be brittle** if Mongo chooses a different valid index: mitigated by asserting intended-key or no-`COLLSCAN` rather than a single exact index name (see D7).
- **CSP relaxation for Swagger** must never leak into production: gated by the `NODE_ENV !== 'production'` check in D2; a unit test covers the production branch.
- **TTL deletion soak not runnable** in the memory-server rig (see D6): covered by index-declaration assertion instead; real TTL cleanup is validated operationally against Atlas.

## Migration

Additive and backward-compatible: new indexes build on first boot (Mongoose `autoIndex` in dev; Atlas builds in background); `rotatedAt` is an optional field so in-flight sessions remain valid; the old single `publicProfile.enabled` index is dropped only after its compound replacement exists (same collection, no downtime at MVP scale). Rollback = revert the change; no data migration is required.

## Follow-ups (out of scope)

- Feed in-memory sort → indexed `_id`/`startDate` sort if candidate counts grow.
- Using `UploadIntent.expiresAt` for a pre-signing flow.
- Redacting logger wrapper for structured logs.
- Indexing the platform-wide reviews scan if review volume grows.