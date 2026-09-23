# Tasks: security-performance

> Scope note: changes in this change support the roadmap requirement `Publish gate counting, reliability reads, and the notifications unread-count run against ≤ the five named explain() hot paths, assert the null-results path never scans the full collection, and use only bus-available index shapes`. All other work is audit/hardening of existing behavior.

## Chunk 1 — Throttling hardening

### Task: Drive Throttler defaults from env with documented defaults
- [x] In `backend/src/app.module.ts`, read `THROTTLE_TTL` (default `60`) and `THROTTLE_LIMIT` (default `100`) into `ThrottlerModule.forRoot`.

### Task: Add a stricter per-route throttle to POST /reports
- [x] In `backend/src/reports/reports.controller.ts`, add `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `POST /reports` (above the existing `@Api`/`@Post` metadata, matching the auth/media pattern).

### Task: Verify and pin the auth + media per-route throttles
- [x] Confirm `auth.controller.ts` `login`/`forgot-password`/`resend-verification` and `media.controller.ts` `upload`/`link`/`confirm` limits already exceed-worthy than the global default; add a brief comment naming the constant values.

### Test: throttling.e2e-spec.ts
- [x] Create `backend/test/throttling.e2e-spec.ts` using `createTestApp` from `backend/test/utils/test-db.ts`.
- [x] Test 429 when exceeding the `POST /reports` per-route limit while still under the global default; assert the envelope `statusCode` 429.
- [x] Test 429 on exceeded `login` limit (5/60s) and confirm the tighter limits fire before the global default.
- [x] Assert a fresh (non-throttled) caller can still hit `POST /reports` and get 201 with a `reports` row.

## Chunk 2 — Helmet, CSP, Swagger gating, secret hygiene

### Task: Gate Swagger to non-production
- [x] In `backend/src/main.ts`, serve Swagger only when `SWAGGER_ENABLED=true` AND `NODE_ENV !== 'production'`; export the gating decision for tests (small exported predicate or env check reused by the e2e).

### Task: Configure CSP to allow Swagger assets only when Swagger is served
- [x] In `backend/src/main.ts`, call `helmet()` with a CSP config added (self + `data:` images/styles) and, only inside the Swagger-serving branch, relax `script-src`/`style-src` for the Swagger UI CDN origins. Production path keeps the strict CSP.

### Task: Secret-hygiene grep audit + boot assertion
- [x] Grep the codebase for `console.log` / `Logger` interpolations referencing `process.env`; confirm no secret value can reach a log string or an HTTP response/header; fix any breach found.
- [x] Add a unit test that captures boot logs (via the `Logger`/Nest logger spy) while a sentinel secret value is set in `process.env`, asserting the sentinel is absent from the captured output.

### Test: swagger-csp.e2e-spec.ts
- [x] In `backend/test/swagger-csp.e2e-spec.ts`, boot with `SWAGGER_ENABLED=true` + `NODE_ENV=test`: `GET /api-docs` (or the chosen Swagger path) is 200 and `content-security-policy` header permits the Swagger assets.
- [x] Boot with `NODE_ENV=production` + `SWAGGER_ENABLED=true`: the Swagger route is not exposed (404) and the CSP header is the strict one.

## Chunk 3 — Media hardening

### Task: Lower the signed-url TTL to 900 seconds
- [x] Change `SIGNED_URL_TTL_SECONDS` in `backend/src/media/storage/supabase-storage.provider.ts` from `3600` to `900`; update the interface contract comment in `backend/src/media/storage/storage-provider.interface.ts` documenting read URLs expire ≤ 900s and upload-token TTL where the provider supports it.

### Task: Tighten youtu.be to exact-match in the link allowlist
- [x] In `backend/src/media/media.constants.ts`, `assertAllowedLinkHost`: keep host-equals-or-subdomain for `youtube.com`/`drive.google.com`; make `youtu.be` exact-match only; keep the `LINK_HOST_NOT_ALLOWED` error.

### Test: media.constants bypass matrix
- [x] Extend `backend/src/media/media.constants.spec.ts`: accepted = `www.youtube.com`, `youtube.com`, `drive.google.com`, `youtu.be`; rejected = `www.youtu.be`, `youtu.be.evil.com`, `youtube.com.evil.com`, `evil-youtube.com`, `https://evil.com`, `ftp://youtube.com/x`, `javascript:alert(1)`, `not-a-url`.

## Chunk 4 — Refresh rotation reuse detection

### Task: Add rotatedAt to the sessions schema
- [x] In `backend/src/auth/schemas/session.schema.ts`, add `rotatedAt?: Date`; keep unique `refreshTokenHash` and the `expiresAt` TTL index.

### Task: Rework refresh() with atomic claim + reuse detection
- [x] In `backend/src/auth/auth.service.ts`, replace the current find-then-replace flow with: hash → `findOneAndUpdate({ refreshTokenHash, rotatedAt: null }, { $set: { rotatedAt } }, { new: false })`.
- [x] On claim: validate `expiresAt` + user status (existing checks), insert the new session, return the pair.
- [x] On pre-image present (reuse): `deleteMany({ userId })` and throw a `BusinessException` with `REFRESH_TOKEN_REUSE_DETECTED` (UPPER_SNAKE code) surfaced as `401`.

### Task: Filter tombstones from session listing
- [x] In `auth.service.ts` `listSessions`, filter `rotatedAt: null` and exclude `rotatedAt`/`refreshTokenHash` from the payload (keep existing shape).

### Test: backend/src/auth/auth.service.spec.ts
- [x] Update `rotates the session on refresh and rejects the old refresh token`: after a refresh, the old row remains with `rotatedAt` set and the new row is live; replay of the old token rejects with `REFRESH_TOKEN_REUSE_DETECTED` and the user has zero remaining sessions.
- [x] Add a concurrent-replay test: two `refresh()` calls with the same token → exactly one resolves, the other rejects with reuse and revokes all sessions.
- [x] Add an expired-refresh test: a session with `expiresAt` in the past rejects with the existing invalid/expired code and no new session row.
- [x] Add a TTL-index assertion: `SessionSchema.path('expiresAt').options.index.expires === 0`.
- [x] Assert `listSessions` returns only un-rotated sessions after a rotate.

### Test: auth.e2e reuses flows
- [x] In `backend/test/auth.e2e-spec.ts`: full HTTP flow — register → refresh → replay original refresh token → expect `401` with `code=REFRESH_TOKEN_REUSE_DETECTED`; subsequent refresh of the new token still works.

## Chunk 5 — Index review

### Task: Add compound indexes
- [x] `backend/src/opportunities/schemas/opportunity.schema.ts`: add `{ status: 1, categoryId: 1 }`, `{ status: 1, 'location.wilayaId': 1 }`, `{ status: 1, 'location.municipalityId': 1 }` (schema-level index declarations) and remove/keep conflict-free with the existing text index (text stays reserved, unqueried — F11 recorded in design.md).
- [x] `backend/src/volunteers/schemas/volunteer-profile.schema.ts`: replace the single `{ 'publicProfile.enabled': 1 }` index with `{ 'publicProfile.enabled': 1, 'location.municipalityId': 1 }`; keep `location.municipalityId` single.
- [x] `backend/src/submissions/schemas/submission.schema.ts`: add `{ organizationId: 1, status: 1 }`.

### Test: schema index declarations
- [x] Add unit assertions that the three opportunity compounds, the volunteers compound (and absence of the lone enabled single), the submissions `(organizationId, status)`, and the sessions `rotatedAt` (field) + TTL index resolve in `model.schema.indexes()`.

## Chunk 6 — explain() evidence on the hot paths

### Task: Explain helper
- [x] Create `backend/src/common/testing/explain-utils.ts` (or reuse a test helper under `backend/test/helpers/`): `findPlan(model, filter)` using `collection.find(filter).explain('executionStats')` and equivalent `distinct`/`count` plumbing; assert no `COLLSCAN` in the winning plan and an intended index key is present.

### Test: backend/test/indexes.e2e-spec.ts
- [x] Seed a small fixture (org + a few submissions; volunteer profiles; opportunities) via `createTestApp` (local memory Mongoose, `await model.init()` first).
- [x] Feed (`{ status, categoryId }`), feed geo (`{ status, location.wilayaId }` and `{ status, location.municipalityId }`), feed `startDate` (`{ status, startDate: { $lte } }`), recommended feed (`{ status }`): each assert its plan uses a `(status, …)` index and no `COLLSCAN`.
- [x] Talents feed (`{ 'publicProfile.enabled': true }` and with `location.wilayaId`): plan uses the compound / enabled equality prefix, no `COLLSCAN`.
- [x] Gate counting distinct over `{ organizationId, status }` in `submitted|under_review`: the explain shows the `(organizationId, status)` index; reliability's `submissionModel.find({ organizationId })` uses its prefix.
- [x] Notifications unread-count (`{ userId, isRead: false }`): plan uses the `(userId, isRead, createdAt)` prefix; assert the `distinct`/null-results path is not a full scan.

## Chunk 7 — N+1 batching on the talents feed

### Task: Batch-populate skills for a page
- [x] In `backend/src/volunteers/volunteers.service.ts`, replace per-card `loadPublicSkills` with: page-scoped `volunteer_skills` `$in` query + one `skills` catalog `$in` for distinct skill ids, mapped in memory; keep the public-safety projection output identical.

### Test: talent batching bounded queries
- [x] In `backend/test/portfolio.e2e-spec.ts` (or a new `talents.e2e-spec.ts`), spy on `volunteer_skills`/`skills` model queries for a page of ≥10 profiles: assert a constant query count regardless of page size and that every card still carries the same skills as before.

## Chunk 8 — Audit posture assertions

### Task: Constant-time jobs-key compare coverage
- [x] Extend `backend/src/core/jobs/jobs-key.guard.spec.ts` (or the existing spec): equal keys pass, unequal keys fail, and the compare path never lops a length mismatch into a distinct early-exit (guard hashes both sides first).

### Task: ObjectId/CastError and DTO whitelist mapping
- [x] Ensure a global mapping turns `mongoose.CastError` into the error envelope `400 INVALID_ID` (UPPER_SNAKE) with no stack/limit leak.
- [x] Confirm `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` is applied globally in `backend/src/main.ts`.

### Task: Sensitive-audit list coverage
- [x] Extend `backend/src/core/audit/audit-coverage.spec.ts`: assert the §0 sensitive actions (admin candidate approvals, `PATCH`/`DELETE` on org resources and volunteer data, reliability/gate writes) are all audited; spot-check no unsensitized writes slip through.

### Test: error-shape e2e
- [x] In `backend/test/app.e2e-spec.ts` (or the existing error tests): `GET /api/v1/opportunities/not-an-object-id` → `400` with `code=INVALID_ID`; a DTO carrying a stray unknown field → `400`; and a `REFRESH_TOKEN_REUSE_DETECTED`/`LINK_HOST_NOT_ALLOWED`/`PUBLISH_GATE_LOCKED` assertion to confirm UPPER_SNAKE codes propagate in the envelope.

## Chunk 9 — Load smoke (optional, descope if tight)

### Task: Pagination depth at limit 50
- [x] Seed >50 opportunities (>50 published) and >50 enabled profiles via `backend/test/helpers/seed-utils.ts`, then `GET /opportunities?limit=50` and `GET /talents?limit=50`; assert a full page, a `next` cursor, and the surviving pagination on the following page; no 5xx.

## Chunk 10 — README + final verification

### Task: Atlas 0.0.0.0/0 MVP-only note
- [x] Add to `backend/README.md` (Infra/Atlas section): the `0.0.0.0/0` network rule is temporary-at-MVP; confine Atlas network access to office IP before production.

### Task: Full verification and wrap-up
- [x] From `backend/`: `npm run build`; `npm run lint`; `npm test`; `npm run test:e2e`.
- [x] `openspec validate security-performance` and `openspec validate --all --strict` pass.
- [x] `openspec archive security-performance -y`.
- [x] Commit locally `perf(security): index audit, throttling, hardening pass` — stage only this change's files, never `git add -A`.