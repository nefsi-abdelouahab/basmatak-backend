## Why

The Organization Dashboard stat cards (RP §2.1#4/#7/#9) and the Public Org Profile stats ribbon (RP §4.4#3/#9) have no real numbers behind them: the public payload's `aggregates` block is served by `InertOrgPublicStatsProvider` (all zeros), the per-org footprint seam is inert, and there is no cross-opportunity roster or private stats endpoint. Session 16 fills these with database-derived aggregates.

## What Changes

- Real `OrgPublicStatsProvider` (Session 14 seam): `{ volunteers, initiativesActive, initiativesCompleted, verifiedHours, responseRate, perDomain[] }` computed from `task_participants`, `opportunities`, `volunteer_experiences`, and the cached reliability snapshot; `activeSince` stays derived from `foundedYear` in `OrganizationsService` (seam shape unchanged).
- Real `OrgFootprintProvider` (Session 8 seam): `{ opportunities, applications, participants, experiences, hours, reliability }` from the same sources; no new consumer is wired (admin-analytics consumes it later unchanged).
- New `GET /organizations/me/participants` (Org): cross-opportunity roster (`?q=&opportunityId=&status=` incl. `completed`, cursor page) joining volunteer identity, position/opportunity labels, and submission state/files.
- New `GET /organizations/me/stats` (Org, roadmap-defined; RP Part 7 names no private dashboard route): active/completed opportunities, applications `pending`/`under_review`, participants active/completed, hours, decisions in last 30d, cached `decidedRatio`/`medianDecisionHours`.
- DI binding swaps only: `organizations.module.ts` (`ORG_PUBLIC_STATS_PROVIDER`) and `admin.module.ts` (`ORG_FOOTPRINT_PROVIDER`) point at the real providers (Session 15 precedent). No other archived file is edited; aggregate joins owned by Session 17 are out of scope.

## Capabilities

### New Capabilities

None — all behavior lands on existing capabilities.

### Modified Capabilities

- `org-aggregates`: footprint metrics get real formulas (replacing "does not define formulas").
- `organizations`: public `aggregates` become database-derived; private `/me/stats` added.
- `participations`: cross-opportunity org roster added.

## Impact

- Code: new `backend/src/participations/org-dashboard.*` (provider + controller + DTOs); two one-line DI binding swaps; no new dependencies, no schema writes (read-only aggregation).
- APIs: two additive Org routes; public `GET /organizations/:slug` keeps its shape with real numbers (intended zero-to-real value change, no shape break).
- Open questions (formulas pending owner confirmation): verified-hours window, active/completed status mapping, per-domain denominator, decisions-30d source.
