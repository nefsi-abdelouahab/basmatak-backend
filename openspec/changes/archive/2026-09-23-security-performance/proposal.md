# Security & Performance Hardening (Session 19)

## Why

The platform has reached feature-complete risk-reduction shape (sessions 3-18), but the hardening tracks in `docs/ROADMAP.md` (lines 858+) are unfinished. Today the API runs simple global throttling, a single-purpose `publicProfile.enabled` index, signed media URLs with a 60-minute TTL, an inert/plain rotation scheme for refresh tokens, and feed/talents/gate/reliability queries that are not proven index-backed. Each of these is a reachable abuse or scale hazard on the free Mongo tier ($0 ~550MB): a spammer-report flood, an leaked refresh token going undetected, an SSRF-adjacent link bypass, or a collection scan slowing the hot read path. This change closes those gaps: harder throttling where abuse pays off, verified security posture (headers/CSP, secret hygiene, constant-time compare), sub-15-minute signed URLs, replay-proof refresh rotation, `explain()`-proven query plans, and batch-loaded feeds — all tested.

## What Changes

- **common-core**: `THROTTLE_TTL`/`THROTTLE_LIMIT` defaults made explicit (60 / 100) with stricter per-route `@Throttle` overrides on credential/abuse-prone routes; Helmet + an explicit Content-Security-Policy (strict in production; Swagger assets allowed only where Swagger is served); Swagger gated to `SWAGGER_ENABLED=true` **and** `NODE_ENV != production`; **added** a Secret hygiene requirement (no secret env values in logs, responses, or headers) backed by a grep audit + boot-time test.
- **auth**: refresh rotation detects replayed tokens — a reused `refreshTokenHash` revokes every session for the user and responds `401 REFRESH_TOKEN_REUSE_DETECTED`; consumed rows become `rotatedAt`-stamped tombstones (atomic claim, listing shows only live sessions, TTL cleans tombstones).
- **media**: signed read URLs and presigned upload URLs expire within 15 minutes (900s); the external-link allowlist is re-affirmed and hardened — host must equal or be a subdomain of an allowlist entry, with `youtu.be` matched exactly — plus bypass-attempt scenarios.
- **reports**: `POST /reports` gains a stricter per-route rate limit so report floods hit `429` before the global default.
- **opportunities**: the `(status, categoryId)`, `(status, location.wilayaId)`, and `(status, location.municipalityId)` compound indexes are added (feed compounding); the F11 canonical decision is recorded (keyword via bounded `$regex` with early `categoryId` bound; geo via indexed `location` fields; the text index stays reserved).
- **volunteers**: `(publicProfile.enabled, location.municipalityId)` compound index replaces the lone `publicProfile.enabled` index; the talents feed batch-populates skills/catalog/media per page instead of querying per card (no N+1).
- **organizations**: the real publish-gate counter's distinct count is led by a `(organizationId, status)` compound index on `submissions` (gate aggregation index), which also serves reliability's org-scoped reads — both proven via `explain()`.

Seven capabilities are Modified (no new capabilities). Cross-cutting audit tasks (ObjectId/CastError handling, DTO whitelists, UPPER_SNAKE error codes, audit sensitive-actions list, constant-time jobs-key compare) verify posture via tests; the only behavior changes are the ones above. Required feature work: 7 task chunks (backlog-preserving), all explicitly scoped with a precedent-width 15/30 explanation.

## Impact

- **API/contract**: one new error code (`REFRESH_TOKEN_REUSE_DETECTED`); tightened CSP on production responses; sub-15-minute signed URLs; `429` on stricter routes. No shapes change elsewhere; all existing scenarios stay green.
- **Data/storage**: additive indexes only (one single-field `publicProfile.enabled` index is dropped in favor of its compound replacement); `sessions.rotatedAt` tombstone field; rotated rows are now retained until TTL expiry (equivalent to that duration of extra rows).
- **Operations**: gate the 7-chunk plan strictly to this session; stage only this change's files on commit (`perf(security): index audit, throttling, hardening pass`); validate with `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`, then `openspec validate` and archive.