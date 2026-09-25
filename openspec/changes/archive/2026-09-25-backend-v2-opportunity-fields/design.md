## Context

The `opportunities` collection currently stores only the v1 core (`title`, `description`, `categoryId`, `registryId`, `status`, `startDate`, `applicationDeadline`, `location`, `positions{title,description,requiredCount,filledCount,requiredSkills}`). Create Opportunity / Opportunity Details designs need mode, cover, end date, duration, prerequisites, and per-position deliverables/schedule; orgs need a single-read for non-published rows and a duplicate route. Dependencies are already shipped: `media-access` (S1) provides the `opportunity_cover` purpose + `MediaOwnership.assertFor`, and `registry-ids` (S1) owns `registryId` minting. The v1 edit-window machinery (`updateOpportunity` pre/post-publish split + accepted-participant gate via `TaskParticipantsAdapter.countAccepted`) is reused, not replaced.

## Goals / Non-Goals

**Goals:**
- Persist the six opportunity-level fields and two position-level fields with DTO validation and lifecycle-aware edit windows.
- Ship org single-read + duplicate (deep position copy, seats reset, fresh slug + `registryId`).
- Expose the new fields on public detail, public feed cards, and org own list/single-read so Sessions 15 (minting) and 16 (aggregates) can consume them.

**Non-Goals:**
- `perks[]`, host-logistics/accommodation/language fields (CUT, FCD #1/#3) — schema-guard asserted, never added.
- `position.applicationCount`, assigned-volunteer names, org embeds/labels (Session 19); duration minting into experiences (Session 15); new indexes beyond verification (mode rides existing feed filters); CSV/PDF; messaging.

## Decisions

- **Mode enum `onsite | remote | hybrid`** (RP §2.3#3, roadmap verbatim). Alternative (boolean `isRemote`) rejected: RP Part 1 names three pills and the feed filter needs three states.
- **Duration as `durationMinutes` positive int** (roadmap verbatim; feeds Session 15 hour aggregates by simple summation). Alternative (hours float) rejected: floats complicate sums and validation; minutes are exact.
- **Cover via existing `MediaOwnership.assertFor(coverMediaId, orgId, 'opportunity_cover')`** — no new media code. Ownership actor is the organization `_id` (media rows for org content are org-owned per the S1 evidence/org-read convention). Absent/foreign → `404` `MEDIA_NOT_FOUND`; wrong purpose → `409` `MEDIA_PURPOSE_MISMATCH`. No new aspect/size constraints: inherits the unchanged upload allowlist from `media-access`. Alternative (new cover service) rejected: seam already covers it.
- **Edit windows extend the v1 split, not a new machine**: draft → full profile + mode/prerequisites/duration/endDate/cover; published (accepted == 0) → `description`, forward-only `applicationDeadline`, + `coverMediaId`; published with accepted > 0 → nothing (existing gate). `mode`/`prerequisites`/`durationMinutes`/`endDate` post-publish → `409` `OPPORTUNITY_FIELD_LOCKED`. `endDate < startDate` → `400`. Alternative (versioned edits) rejected: out of scope, v1 pattern suffices.
- **Bounds for free-text arrays**: `prerequisites` / `positions[].deliverables` ≤ 20 items, each ≤ 500 chars (create + position add/patch). Rationale: mirrors `portfolio-meta` bounding style (≤ counts + char caps); prevents abuse blobs on Atlas M0.
- **Duplicate = service-level deep copy** (no transaction: single-document create; reads source + `createWithUniqueSlug` + `registryId.getNext`). `filledCount` → 0, new position sub-ids, status `draft`. Alternative (Mongo transaction) rejected: one write, no multi-doc atomicity needed.
- **Routes registered in `OpportunitiesController`** on the existing `organizations/me/opportunities…` path family, declared before `GET /organizations/:slug/opportunities` so `me` is never swallowed by `:slug`. No edits to `organizations.controller.ts` (S4 file-disjointness).

## Risks / Trade-offs

- [Risk] Legacy rows lack new fields → public detail shape varies → Mitigation: null-safe reads (absent scalars → null/absent, arrays default `[]`); covered by a dedicated scenario.
- [Risk] Cover media deleted after attach → dangling `coverMediaId` → Mitigation: out of scope (media soft-delete already hides bytes; id remains a stable reference); documented, not handled.
- [Risk] `endDate` + `startDate` ordering across PATCH partial updates → Mitigation: validate the merged pair (stored startDate vs incoming endDate and vice versa), not just the incoming pair.
- [Risk] Duplicate slug collision on identical titles → Mitigation: reuse `createWithUniqueSlug` numeric-suffix retry.

## Migration Plan

Additive, no migration: all new fields optional/nullable with schema defaults (`prerequisites: []`, `deliverables: []`); existing rows read back null-safe. Rollback = revert code; stored new fields on new rows are inert to old code (unknown keys ignored on read, `forbidNonWhitelisted` only guards writes).

## Open Questions

None blocking. Resolved from roadmap/RP without re-asking: mode enum values = `onsite|remote|hybrid` (roadmap §4 Session 11 + RP Part 7); duration unit = minutes, positive int (roadmap task list); cover constraints = inherit `media-access` upload allowlist, no new aspect/size rules (Session 2 allowlist unchanged, Session 11 "None new"); application cover-message wiring already done (Session 5) — untouched.
