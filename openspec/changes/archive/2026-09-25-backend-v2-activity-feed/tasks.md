## 1. Module scaffolding

- [x] 1.1 Create `backend/src/activity/` module (module, controller, service, list-query DTO with `limit`/`cursor`, whitelist + `forbidNonWhitelisted`) and register it in `AppModule` without editing peer modules
- [x] 1.2 Implement the activity item mapper (`{ type, title, ts, entity: { type, id, name, slug?, summary } }`) and the org/volunteer event-type registries per spec coverage

## 2. Scoped feed queries

- [x] 2.1 Implement org scoping (resolve `organizationId` from `organizations.userId`, constrain histories to the org's opportunity entity ids and notifications to the org account) with newest-first window queries
- [x] 2.2 Implement volunteer scoping (resolve `volunteerId` from `volunteer_profiles.userId`, constrain both source legs to the caller's records) with newest-first window queries
- [x] 2.3 Implement merge (newest-first by `ts` with `_id` tie-break), transactional dedupe (`dedupeKey`/payload correlation with entity+transition+time-bucket fallback), and `CursorPage` pagination (`total`/`page`/`pages`, opaque composite cursor) following the `execPage` convention

## 3. Entity summaries

- [x] 3.1 Implement batched lean summary fetch per entity type (opportunity title, org name, volunteer name, submission state; text only, no private media) with an N+1 guard

## 4. Tests

- [x] 4.1 Unit tests: ordering/merge logic, dedupe of transactional history+notification pairs, entity summary building (incl. missing/deleted references)
- [x] 4.2 E2E tests: org performs accept → start-review → verify ⇒ both feeds reflect each step; pagination/totals correct; volunteer feed excludes other orgs' activity; role guards (guest 401, cross-account 403/404)

## 5. Verification

- [x] 5.1 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`, then `openspec validate backend-v2-activity-feed` from repo root
