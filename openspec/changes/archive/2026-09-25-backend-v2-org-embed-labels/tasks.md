## 1. Opportunity embeds provider

- [x] 1.1 Create `backend/src/opportunities/opportunity-embed.provider.ts`: batched org embed + category/location/skill labels (one query per entity per page, null-safe)
- [x] 1.2 Add `position.applicationCount` (non-terminal statuses) + `assigned` names (`active|accepted|completed`, names only) to the provider
- [x] 1.3 Wire `FavoritesService` favorites state (`isFavorited` per viewer, `favoriteCount` platform) into the provider; guests get counts with `false`
- [x] 1.4 Apply the provider to feed, detail, org-own list/single-read and slug-archive reads; thread optional-auth caller in the controller

## 2. Application inbox joiner + reads

- [x] 2.1 Create `backend/src/applications/application-inbox.joiner.ts` (real `ApplicationInboxJoiner`: volunteer/org/opp/position names + `decidedBy` from status histories, batched)
- [x] 2.2 Bind the real joiner in `backend/src/applications/applications.module.ts` (module-scoped shadow of the inert default; `common.module.ts` untouched); extend the row type with optional embed fields
- [x] 2.3 Enrich `listMyApplications`/`getApplication`/`listOpportunityApplications` payloads with the same joins

## 3. Talent favorites + submission/participation joins

- [x] 3.1 Embed `isFavorited`/`favoriteCount` on talent cards + public profile; add optional-auth guards in `public-volunteers.controller.ts`
- [x] 3.2 Add batched volunteer join to the submissions org inbox + detail reads
- [x] 3.3 Add org/task/schedule/location + deliverable joins to volunteer participation reads; extend roster embeds (avatar, deliverables, location labels)

## 4. Module wiring

- [x] 4.1 Import `FavoritesModule` in `OpportunitiesModule` + `VolunteersModule`; register read-only label/count refs; verify no circular imports (`npm run build`)

## 5. Tests and verification

- [x] 5.1 Unit tests: embed batching (no N+1 via mocked models), count/assigned-status filtering, joiner enrichment, guest `favorited:false`
- [x] 5.2 E2E tests: feed/detail/org reads carry embeds + labels + counts + names; inbox rows joined and org-scoped; talents/profile favorites authed vs guest; isolation across orgs/users
- [x] 5.3 Verify from `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; batching guarded by unit test (single org query per page via find-spy) and indexed query paths (`(organizationId,status)`, `(targetType,targetId)`, `(opportunityId,status)`)
- [x] 5.4 Validate from repo root: `openspec validate backend-v2-org-embed-labels`
