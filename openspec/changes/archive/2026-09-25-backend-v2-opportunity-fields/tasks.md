## 1. Schema and DTOs

- [x] 1.1 Extend `OpportunitySchema`/`PositionSchema` with `mode`, `coverMediaId`, `endDate`, `durationMinutes`, `prerequisites`, `positions[].deliverables`, `positions[].startAt` (+ defaults); assert no `perks`/logistics paths.
- [x] 1.2 Extend `CreateOpportunityDto`/`CreatePositionDto` and `UpdateOpportunityDto`/`UpdatePositionDto` with the new fields and validation (mode `IsIn`, duration int ≥ 1, ISO dates, array bounds ≤ 20 × ≤ 500).
- [x] 1.3 Verify no new index is required (mode rides existing feed filters); keep index set unchanged.

## 2. Service logic

- [x] 2.1 Persist new fields on `createOpportunity` (incl. `endDate ≥ startDate` check + `MediaOwnership.assertFor` cover check + fresh `registryId`).
- [x] 2.2 Enforce `updateOpportunity` edit windows (draft-full vs published safe-set + cover-until-acceptance; `OPPORTUNITY_FIELD_LOCKED` for mode/prerequisites/duration/endDate post-publish; merged-pair date ordering).
- [x] 2.3 Implement `getOwnById` (ownership-scoped, any status, `404` on foreign/malformed) and `duplicateOpportunity` (deep position copy, fills reset, fresh slug + `registryId`, status `draft`).
- [x] 2.4 Extend public-detail, feed-item, and org own-list projections with the new fields (null-safe for legacy rows); wire position add/patch for `deliverables`/`startAt`.

## 3. Routes

- [x] 3.1 Add `GET /organizations/me/opportunities/:id` and `POST /organizations/me/opportunities/:id/duplicate` in `OpportunitiesController` before the `:slug` route; keep `organizations.controller.ts` untouched.

## 4. Tests and verification

- [x] 4.1 Unit tests: edit-window matrix, duration/date validation, duplicate seat-reset + draft + independence, cover 404/409 paths.
- [x] 4.2 E2E tests: create-with-all-fields → read back; duplicate → independent id/slug/registryId/draft; public detail + own list expose fields; schema-keys guard against `perks`/logistics.
- [x] 4.3 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`; run `openspec validate backend-v2-opportunity-fields` from repo root.
