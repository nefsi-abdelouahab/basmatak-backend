## 1. Schema, whitelist, and DTO

- [x] 1.1 Widen `APPLICATION_STATUSES` in `backend/src/applications/schemas/application.schema.ts` to `['pending','under_review','accepted','rejected','withdrawn']` and widen the partial unique `(positionId, volunteerId)` index's `partialFilterExpression` to `status in ('pending','under_review','accepted')`; add `ApplicationSchema.index({ organizationId: 1, status: 1 })`
- [x] 1.2 Update `ApplicationsModule.onModuleInit` whitelist registration to the full v2 machine: `pending → accepted|rejected|withdrawn|under_review`, `under_review → accepted|rejected|withdrawn`, `accepted → withdrawn` (additive; existing pairs untouched)
- [x] 1.3 Add `ApplyApplicationDto` (`message?`: `IsOptional`, `IsString`, `MaxLength(2000)`) and `OrganizationApplicationsQueryDto` (`opportunityId?` IsMongoId, `status?` IsIn statuses, `q?` IsString MaxLength 100, `cursor?`, `limit?`) in `backend/src/applications/dto/application.dto.ts`

## 2. Apply accepts a cover message

- [x] 2.1 `ApplicationsService.apply(account, opportunityId, positionId, message?)` stores the supplied message (trimmed, `undefined` when absent) in the created application; no new write path after creation
- [x] 2.2 Applications controller `apply` accepts `@Body() dto: ApplyApplicationDto` and forwards `dto.message`; verify `message` is returned in own/org read payloads (`/applications/me`, `GET /applications/:id`, `GET /opportunities/:id/applications`)

## 3. start-review route

- [x] 3.1 `ApplicationsService.startReview(account, applicationId)`: owning org (404 `APPLICATION_NOT_FOUND` for foreign/volunteer); status-scoped `findOneAndUpdate({ _id, status:'pending' }, { $set:{ status:'under_review' } }, { new:true })`; matchedCount 0 → 409 `INVALID_APPLICATION_STATUS`; then `StatusTransitionService.assert({ entityType:'application', from:'pending', to:'under_review', actor })`
- [x] 3.2 Controller `POST /applications/:applicationId/start-review` (organization role, `@HttpCode(200)`, `@ApiOperation`), declared before any catch-all route

## 4. Status-aware accept / reject / withdraw

- [x] 4.1 `acceptApplication`: read `currentStatus` from the reloaded application; scope the in-transaction update to `{ _id, status: currentStatus }` and the in-transaction `assert` to `from: currentStatus` (`pending|under_review → accepted`); transaction body otherwise unchanged
- [x] 4.2 `rejectApplication`: status-scope the guarded update and `assert` to the application's read status (`pending|under_review → rejected`), reason stored; update the 409 message
- [x] 4.3 `withdrawApplication` plain path: accept `pending | under_review` (`status: { $in: [...] }` scoped update + matching `assert`); accepted-transaction path unchanged; update the 409 message

## 5. Aggregate inbox and seam

- [x] 5.1 Create `backend/src/common/seams/application-inbox-joiner.ts`: `APPLICATION_INBOX_JOINER` token, `ApplicationInboxRow` interface (plain application fields), `ApplicationInboxJoiner.enrich(organizationId, rows)`, `InertApplicationInboxJoiner` (pass-through no-op)
- [x] 5.2 Bind + export the inert provider under the token in `backend/src/common/common.module.ts` (additive, global module)
- [x] 5.3 `ApplicationsService.listOrganizationInbox(account, query)`: resolve owning org (403 for volunteer via role guard, 404 if none); filter `{ organizationId }` + optional `status`/`opportunityId`; `q` pre-resolves the org's own opportunities matching `title`/`positions.title` (bounded `$regex`) into an `opportunityId: { $in: [...] }` conjunct; cursor-paginate newest-first (default 20 / max 50); route rows through `ApplicationInboxJoiner.enrich`
- [x] 5.4 Controller `GET /organizations/me/applications` (organization role) with `OrganizationApplicationsQueryDto`

## 6. Unit tests

- [x] 6.1 Whitelist: `pending → under_review`, `under_review → accepted|rejected|withdrawn` admitted; `accepted → under_review` rejected with `INVALID_STATUS_TRANSITION` and no history row
- [x] 6.2 `apply` stores a trimmed message; oversized message → 400 validation; `startReview` 404 (foreign org/volunteer) and 409 (already `under_review`, `accepted`, `rejected`)
- [x] 6.3 Status-aware accept: `under_review → accepted` writes exactly one history row and claims one seat; reject from `under_review` writes one history row and the reason
- [x] 6.4 Withdraw from `under_review` writes `under_review → withdrawn`; seam passthrough returns rows unchanged; `q` pre-resolution narrows to matching opportunities

## 7. E2E tests

- [x] 7.1 Extend `backend/test/applications.e2e-spec.ts`: apply with `message` → persists, visible to volunteer `GET /applications/me` and org `GET /applications/:id`
- [x] 7.2 Org start-review: pending → `under_review`; repeated call → 409; foreign org → 404; volunteer → 403/404
- [x] 7.3 Accept from `under_review` (seat claimed, participant created, exactly one `under_review → accepted` history row); reject from `under_review` (reason stored, one history row)
- [x] 7.4 Aggregate inbox: applications across two opportunities paginate; `?status=`, `?opportunityId=`, `?q=` filter; a second org's rows never appear; volunteer → 403; dedupe index blocks a duplicate while an application is `under_review`

## 8. Verification and wrap-up

- [x] 8.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green (record any pre-existing sibling failure)
- [x] 8.2 From the repo root: `openspec validate backend-v2-application-states` and `openspec status --change backend-v2-application-states` — artifacts valid
- [x] 8.3 Commit locally (no push): `git add -A`; `git commit -m "feat(backend-v2-application-states): cover messages, under_review state, org aggregate inbox"`