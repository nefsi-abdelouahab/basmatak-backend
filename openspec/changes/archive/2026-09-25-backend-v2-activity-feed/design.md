## Context

Events already exist in two places: `status_histories` (`entityType`, `entityId`, `from`/`to`, `actor`, optional `reason`/`notes`; index `(entityType, entityId, createdAt)`) written by `StatusTransitionService`, and `notifications` (`userId`, `type`, `payload`, `isRead`, `dedupeKey` with a partial unique index; index `(userId, isRead, createdAt)`) written by the event bus or inside transactions via the notifications repository seam. There is no unified per-account view: RP §2.1#10 (org dashboard feed) and §2.8#12 (org profile recent activity) plus the volunteer journey have no route. Pagination contract is the shared `CursorPage` (`items`, `nextCursor`, `limit`, `total`, `page`, `pages`) with the `execPage` helper (count base filter, fetch `limit + 1` with a deterministic sort). Org identity resolves via `organizations.userId`; volunteer identity via `volunteer_profiles.userId`. S4 peers (`opportunity-fields` on `opportunities`, `settings-expansion` on settings) are file-disjoint from this new `activity` module.

## Goals / Non-Goals

**Goals:**
- Two scoped, chronological, cursor-paginated feeds with a stable item contract and entity summaries, computed from existing data.
- Strict per-account isolation and transactional dedupe, with no new storage or ranking.

**Non-Goals:**
- New collection or write path; push/real-time delivery; AI/ML or engagement ranking; dashboard `latestVerifiedExperience` card (Session 14); embeds on other payloads (S7); admin or cross-org aggregation.

## Decisions

- **Computed read, no new collection.** RP Part 7's collection column for this row is `—` (none) and the roadmap lists reads only. Rationale: zero 512 MB Atlas impact and no write-amplification on every transition. Alternative (denormalized feed-entries collection) rejected: faster single-source pagination but every accept/verify/publish would fan out extra writes against the free-tier budget.
- **New `backend/src/activity/` module wired in `AppModule`; no edits to existing modules.** Keeps the S4 file-disjointness promise and makes rollback a deletion. Reads peer collections only through models/lean queries.
- **Merge in service memory over bounded windows.** Each request runs two scoped window queries (histories + notifications, newest-first, `limit + 1` each via the `execPage` convention), merges by `ts` (`createdAt`) with `_id` tie-break, dedupes, then slices to `limit`. Alternative (single driving source with the other as enrichment) rejected: it would silently drop events that exist in only one source.
- **Totals as the exact union of dedupe keys over key-only projections.** Window-derived estimates undercount pairs split across windows (total would vary with page size), so the service counts the union of canonical keys via lightweight indexed projections while document windows stay bounded. Cheap at pilot scale.
- **Authoritative-source suppression instead of cross-page dedupe.** Dedupe by key is window-local, but per-leg cursor continuation visits every row exactly once — so a history/notification pair split across page windows would reappear. Notification rows fully covered by an authoritative leg are therefore suppressed outright (`application.created` → document leg; decision transitions → `status_histories`). In-window key dedupe remains as a backstop.
- **Scoping by ownership, never by caller-supplied ids.** Org feed: `organizationId` from `organizations.userId = sub`, then opportunity ids of that org constrain histories, and `notifications.userId = sub` constrains the notification leg. Volunteer feed: `volunteerId` from `volunteer_profiles.userId = sub` constrains both legs. Foreign ids are not accepted as filters.
- **Entity summaries via batched lean reads (`select` of title/name/state only), grouped per entity type.** Avoids N+1 and never loads private media; public vs owner visibility of evidence is irrelevant here because summaries carry text only.
- **No new indexes by default.** Existing `(entityType, entityId, createdAt)` and `(userId, isRead, createdAt)` indexes cover the window queries; any `(actor, createdAt)` need is a follow-up verified with `explain()`, not assumed.

## Risks / Trade-offs

- [Merged-union pagination is not a single atomic snapshot] → Mitigation: bounded windows, deterministic sort + opaque composite cursor, totals documented as additive metadata; acceptable per established pagination discipline.
- [Fan-in cost grows with org history size] → Mitigation: windowed queries (`limit + 1` per source), lean projections, batched summary fetch; pilot scale (100 volunteers) keeps this trivial.
- [Source timestamp skew] → Mitigation: single `ts = createdAt` rule on both legs; tie-break by `_id`.
- [Scope leakage across orgs/volunteers] → Mitigation: server-derived scoping only; e2e isolation tests per spec.
- [Concurrent S4 peers in this tree] → Mitigation: this change touches only `backend/src/activity/` + `AppModule` registration + its own specs/tests; no shared files.

## Migration Plan

Additive only: new module, two routes, no schema or index changes, no data backfill. Deploy with the normal build. Rollback: unregister the module and delete `backend/src/activity/` — existing data untouched.

## Open Questions

None blocking. Storage model is resolved as computed read per RP Part 7 + roadmap Session 12 (see proposal). Optional follow-up (not in tasks): composite opaque cursor versioning if the merge window strategy ever changes.
