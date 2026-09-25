## Why

Create Opportunity and Opportunity Details have no backend for their designed fields: mode (on-site/remote/hybrid), cover image, end date, duration, prerequisites, and per-position deliverables/schedule do not exist, and orgs have no single-read or duplicate route for their own (incl. draft) opportunities. Session 11 adds these real fields (RP Part 7 opportunities row; RP §2.3#1–#5, §2.2#6/#7, §1.3#2/#3).

## What Changes

- `opportunities` add `mode: onsite | remote | hybrid`, `coverMediaId` (purpose `opportunity_cover`, asserted via `MediaOwnership.assertFor`), `endDate`, `durationMinutes` (positive int, minutes), `prerequisites[]`; `positions[]` gain `deliverables[]` + optional `startAt`.
- Create/patch DTOs accept the new fields with v1 lifecycle edit windows: mode/prerequisites pre-publish only, cover changeable until first acceptance, duration/endDate guarded by the published safe-set + accepted-participant gate.
- New org routes: `GET /organizations/me/opportunities/:id` (own single read, any status incl. drafts) and `POST /organizations/me/opportunities/:id/duplicate` (deep copy of positions, seats reset, status `draft`, fresh slug + `registryId`).
- Public detail + org own list projections expose the new fields so Sessions 14/16 can consume duration/endDate.
- Explicitly NOT built (owner-confirmed cuts): `opportunities.perks[]`, host-logistics/accommodation/language fields (FCD #1, #3). No `position.applicationCount` / assigned-name joins (Session 19); no duration minting into experiences (Session 15). `registryId` already exists — read-only here.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `opportunities`: new fields, extended create/patch DTOs + edit windows, cover ownership assertion, single-read + duplicate routes, extended public/org projections, position deliverables/startAt.

## Impact

- Touches `backend/src/opportunities` only (schema, DTOs, service, controllers); S4 peers (`activity-feed`, `settings-expansion`) are file-disjoint.
- Depends on S1 `media-access` (`opportunity_cover` purpose) and S1 `registry-ids` (read-only). No new collections, no new packages, no migration (all fields optional/nullable).
