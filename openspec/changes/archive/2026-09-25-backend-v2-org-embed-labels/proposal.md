## Why

Cards, inboxes and detail screens across the product render organization names, verified badges, category/location/skill labels, application counts and volunteer names — but the read payloads behind them still return bare ids and counts of zero. This change fills those display joins (including the inert `ApplicationInboxJoiner` seam and the deferred favorites card-state embeds) with plain batched data joins.

## What Changes

- Opportunity feed/detail/org-own/org-archive payloads gain `organization {id,slug,nameFr,nameAr,logoMediaId,verificationStatus}` plus `categoryName`, location labels and skill names (batched, page-capped).
- Public opportunity detail (and org own rows) gain `position.applicationCount` (non-terminal applications per position) and `assigned` volunteer names (`active|accepted|completed` participants only, names only — decision 5).
- Application payloads (`/applications/me`, detail, per-opportunity list, org aggregate inbox) gain volunteer profile summary, org/opp/position names and decision actor; the org inbox is enriched by the real `ApplicationInboxJoiner`.
- Participation payloads gain org/task/schedule/location names and position deliverables; the org roster position embed gains deliverables.
- Submission inbox/detail rows gain a volunteer join (username, name, avatar, base).
- Opportunity feed/detail and talent cards/profile gain `isFavorited`/`favoriteCount` via internal reuse of `FavoritesService` lookups (no duplicated logic); guests see counts with `isFavorited: false`.
- No new collections, no new routes, no filter/sort/pagination changes, no AI/ML ranking.

## Capabilities

### New Capabilities

None — every addition lands as new fields on existing payloads.

### Modified Capabilities

- `opportunities`: org embed, label fields, `position.applicationCount`, assigned names, favorites card state.
- `applications`: name joins on volunteer/org reads plus the filled inbox joiner.
- `volunteers`: `isFavorited`/`favoriteCount` on talent cards and the public profile.
- `submissions`: volunteer join on the org inbox and detail reads.
- `participations`: identity/schedule/deliverable joins on volunteer reads and the org roster.

## Impact

Read-path only. Additive fields on existing payloads; existing field names and behavior unchanged for shipped clients. Touches archived-owned read services (listed below); writes, transitions, guards and authz matrices untouched. Extra batched queries per page (N+1 guard: one query per joined entity per page).

## Archived files to be edited (explicit approval list — additive only)

| File | Justification |
|---|---|
| `backend/src/opportunities/opportunities.service.ts` | Shared embed assembler (org embed, labels, counts, assigned, favorites) applied to feed/detail/own/slug-archive reads |
| `backend/src/opportunities/opportunities.controller.ts` | Thread optional-auth caller into detail + slug-archive routes (guests unchanged) |
| `backend/src/opportunities/opportunities.module.ts` | Import `FavoritesModule`; register read-only label/count refs |
| `backend/src/volunteers/volunteers.service.ts` | `isFavorited`/`favoriteCount` on `TalentCard` + public profile |
| `backend/src/volunteers/public-volunteers.controller.ts` | Optional-auth guards + caller threading on talents/profile routes |
| `backend/src/volunteers/volunteers.module.ts` | Import `FavoritesModule` |
| `backend/src/applications/applications.service.ts` | Name joins on reads; consume filled inbox joiner |
| `backend/src/applications/applications.module.ts` + `backend/src/common/common.module.ts` | Bind real `ApplicationInboxJoiner` over the inert default |
| `backend/src/common/seams/application-inbox-joiner.ts` | Additive optional embed fields on the row type |
| `backend/src/participations/participations.service.ts` | Identity/schedule/deliverable joins on volunteer reads; avatar + deliverables on per-opportunity roster |
| `backend/src/participations/org-dashboard.service.ts` | Roster position embed gains deliverables (+ opportunity location labels) |
| `backend/src/submissions/submissions.service.ts` (+ `submissions.module.ts` iff a profile ref is needed) | Batched volunteer join on org inbox + detail |
| Existing `*.spec.ts` / e2e files for the above | Extend coverage for the new fields only |

New files (no archived behavior touched): `opportunity-embed.provider.ts`, `application-inbox.joiner.ts` (+ specs). `organizations.service.ts` needs NO edit (slug-archive enrichment happens in the opportunities-service caller via existing `listForIds`).
