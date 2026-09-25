## Context

RP Part 7's favorites row fixes the contract: `favorites` collection `{ userId, targetType, targetId, createdAt }` with unique `(userId, targetType, targetId)`; routes `POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username`, `GET /favorites`, `GET /favorites/counts`; cards expose `favorited`/counts (RP §1.1#2, §1.2#6, §1.3#7; owner decision 13 "Save/Bookmark"). The roadmap Session 17 refines this: `targetType: opportunity|talent`, idempotent toggles (POST twice → one row, DELETE absent → 204), cursor + totals on the list, `favorited` via optional-auth token with guests seeing counts only. S6 peers (`org-dashboard` on participations/organizations, `pdf-attestation` on verifications) are file-disjoint from a new `favorites` module. Pagination contract is the shared `CursorPage` (`items`, `nextCursor`, `limit`, `total`, `page`, `pages`) with the Session 7 `execPage` convention; error envelope is `{ statusCode, code, message }` with UPPER_SNAKE codes (`OPPORTUNITY_NOT_FOUND`, `VOLUNTEER_PROFILE_NOT_FOUND` already exist for reuse). `@Roles('volunteer')` + the global JWT guard already yield guest 401s (decision 10 needs no new logic); `OptionalJwtAuthGuard` (media-read precedent) covers guest-tolerant reads.

## Goals / Non-Goals

**Goals:**
- Standalone `backend/src/favorites/` module (schema, service, controller, DTOs) with the six RP routes plus one batch lookup, wired in `AppModule`, zero edits to existing modules.
- Idempotent toggles safe under concurrency; per-account isolation; counts-only public visibility.
- Card state deliverable without archived-file edits via the batch lookup endpoint.

**Non-Goals:**
- Direct `favorited`/`favoriteCount` embeds on opportunity/talent read payloads (blocked — see Open Questions; critical rule).
- Folders/collections, favoriting orgs, who-favorited exposure, cascade deletes, AI/ML or recommendation ranking.

## Decisions

- **Separate POST/DELETE endpoints per target kind, not a single toggle endpoint.** RP Part 7 names exactly these routes; a generic `POST /favorites` body-driven toggle was considered and rejected (weaker validation, ambiguous idempotency codes, diverges from the plan).
- **`targetType` vocabulary `opportunity|talent`.** Matches roadmap Session 17 and the route vocabulary (`/favorites/talents/:username`). The alternative `opportunity|volunteer` was considered; `talent` is kept because the saver-facing concept is the talent-directory card, and `targetId` for talents is the volunteer `userId` (stable across renames since usernames resolve server-side at write time).
- **New module only; peer collections read via lean queries owned by this module.** Existence checks (opportunity by id) and username→userId resolution run inside `FavoritesService` with `select` projections. No service/controller/DTO file of `opportunities`, `volunteers`, or `auth` is edited, preserving S6 disjointness and the archived-session rule.
- **`targetId` stored as string.** Opportunity ObjectId hex and volunteer userId hex share one unique triple index; avoids mixed-type index pitfalls. Opportunity keys are ObjectId-validated at the boundary; talent keys are usernames at the boundary, userIds in storage.
- **Duplicate-key collapse for race safety.** Unique index is the arbiter; the service catches E11000 and returns the already-saved 200 path instead of a 500. Alternative (pre-check-then-insert) rejected: still races.
- **Visibility gating limited to existence.** POST validates the target exists (any status/visibility); favorites are private to the saver so unpublished-target saves leak nothing, and `favoriteCount` requires knowing the target id. Draft-visibility 404 rules were considered and rejected as invented policy beyond RP.
- **Added `GET /favorites/lookup` (deviation, flagged for sign-off).** RP says "cards expose favorited/counts" but direct payload embeds require archived-file edits (blocked below). Lookup delivers identical card state in one round trip (≤50 keys) with optional auth; if the owner later approves the embeds, lookup remains a valid batch API for non-feed surfaces.
- **Best-effort summaries, no cascades.** List items carry `{ title, slug }` / `{ username, fullName }` snapshots resolved at read time, `null` when the target is gone. Delete-cascades would need hooks inside archived modules — rejected per the critical rule; stale-row cleanup is a future maintenance note, not this change.
- **Counts split by purpose.** `GET /favorites/counts` = caller's own per-type totals (tab badges); `lookup[].favoriteCount` = platform per-target totals (card social proof). Conflating them was rejected.

## Risks / Trade-offs

- [`lookup` is additive beyond the RP row] → Mitigation: explicitly flagged as a deviation in proposal + report; removable without touching the six RP routes if the owner prefers embeds-only.
- [Stale rows accumulate after target deletes] → Mitigation: null-summary contract + 204-always DELETE; counts over tiny per-user sets stay cheap; no silent cross-module hooks.
- [`favoriteCount` via `countDocuments` per key] → Mitigation: bounded key set (≤50), covered `(targetType, targetId)` index; pilot scale trivial; `explain()` check in tasks.
- [Concurrent S6 peers in this tree] → Mitigation: this change touches only `backend/src/favorites/` + `AppModule` registration + its own specs/tests.

## Migration Plan

Additive only: new collection (indexes created by the schema), six routes + lookup, no schema changes elsewhere, no backfill. Deploy with the normal build. Rollback: unregister the module and drop `favorites` — existing data untouched.

## Open Questions

- **BLOCKED per critical rule — direct `favorited`/`favoriteCount` embeds on read payloads.** Roadmap Session 17 asks for embeds on opportunity feed/detail and talent cards, but that requires editing archived-session files: `backend/src/opportunities/opportunities.service.ts` + `opportunities.controller.ts` (feed already has `OptionalJwtAuthGuard`; detail `GET /opportunities/:idOrSlug` is bare `@Public()` and would need the optional guard + caller threading through `getByIdOrSlug`), and `backend/src/volunteers/volunteers.service.ts` (`listPublicTalents`, `getPublicProfile`) + `public-volunteers.controller.ts` (bare `@Public()` routes needing the optional guard). Owners: v1 `2026-09-22-opportunities` / `2026-09-22-volunteer-profiles` plus archived `backend-v2-opportunity-fields`, `backend-v2-public-exposure`, `backend-v2-pagination-totals`. No MODIFIED delta spec is authored for these in this change and no such edit will be implemented without explicit owner go. Options for the owner: (a) approve a follow-up micro-edit to those files after this change archives; (b) defer embeds to Session 19 `org-embed-labels` (highest fan-out session, already touches those read payloads); (c) accept `lookup` as the permanent card-state mechanism. Recommendation: (c) now, (b) opportunistically.
