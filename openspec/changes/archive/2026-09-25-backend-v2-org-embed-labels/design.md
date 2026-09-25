## Context

Read payloads in `opportunities`, `applications`, `participations`, `submissions` and `volunteers` return bare foreign-key ids where the product renders names, badges, labels and counts. Prior sessions left explicit seams for this one: `ApplicationInboxJoiner` (inert, defined in Session 5) and the favorites `lookup`-only card state (Session 17 deferred direct embeds as option (b) to this session). `organizations.service.listOrgOpportunities` notes its aggregate joins "stay in Session 17" (this session; numbering drift). The Session 16 roster already joins volunteer/opportunity/submission/hours; volunteer-side participation reads and submission inbox rows are still raw. All target files are archived-owned, so every edit is listed in the proposal and must be additive.

## Goals / Non-Goals

**Goals:** one shared embed assembler for opportunity reads; real inbox joiner behind the existing seam token; favorites state embedded via the existing store; batched joins everywhere (no N+1); guest responses byte-compatible apart from new fields.

**Non-Goals:** new routes/collections; filter/sort/pagination changes; messaging; ranking; touching `organizations.service.ts` (slug-archive enrichment happens in the opportunities-service caller); admin-list embeds (Session 10 shipped).

## Decisions

- **Shared `OpportunityEmbedProvider` (new file in opportunities module)** over per-route inline joins: feed, detail, org-own and slug-archive share org/label/count/assigned/favorites assembly; page-capped id-batched queries (orgs, categories, skills, locations, applications, participants, favorites). Alternative (service-method duplication) rejected — four call sites would drift.
- **Service-to-service favorites reuse** over duplicating count logic: `OpportunitiesModule`/`VolunteersModule` import `FavoritesModule` (`FavoritesService` is already exported) and call batched count + per-viewer saved-set paths internally (bounded to page size, ≤50). Rationale: Session 17's rule — no duplicated logic; `lookup`'s HTTP bounds don't apply in-process but the same page-cap discipline does.
- **Real joiner in a new `application-inbox.joiner.ts`** bound to `APPLICATION_INBOX_JOINER` in `CommonModule` (replacing the inert class): batch-resolves profiles, orgs (via existing `listForIds`), opportunities + positions, and decision actors from `status_histories`. Applications module code unchanged (still consumes the token).
- **`OptionalJwtAuthGuard` on detail/slug-archive/talents/profile routes** (feed already has it): guests flow identically, authed callers thread `account.sub` for `isFavorited`. No authz matrix changes.
- **Slug-archive enrichment in `OpportunitiesService.listByOrganizationSlug`** (the delegation caller), not in `organizations.service.ts`: keeps the approved file list minimal and honors the "reads collection directly" ownership comment.
- **Additive row-type extension** (`ApplicationInboxRow` gains optional embed fields) rather than a parallel type: inbox consumers keep compiling; runtime rows are supersets.

## Risks / Trade-offs

- [Extra queries per page] → Mitigation: one query per joined entity per page; `explain()` check on feed + inbox in tasks; counts use indexed `(targetType,targetId)` / `(opportunityId,status)` paths.
- [Decision-actor resolution cost] → Mitigation: single `status_histories` `$in` query per page, latest accept/reject/reviewer actor only; absent history yields `decidedBy: null`.
- [Circular module imports via FavoritesModule] → Mitigation: favorites imports no feature modules (only schemas); verified at build.
- [Dirty tree (uncommitted admin edits + `gh.txt`, `.codex/`)] → Mitigation: Phase 2 stages only this session's files; pre-existing dirt is untouched.

## Migration Plan

Deploy with the normal build; rollback is a code revert (no schema changes, no backfill). No client migration: all additions are new optional fields.

## Open Questions

- Should org own-list rows also carry `assigned` names, or counts only? (Proposal: counts only; confirm in review.)
- Should per-opportunity participant roster include position `deliverables[]` given payload size? (Proposal: yes, bounded pages.)
