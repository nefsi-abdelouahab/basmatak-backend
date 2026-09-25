## 1. Module scaffolding

- [x] 1.1 Create `backend/src/favorites/` module (module, controller, service, `favorite.schema.ts` with `{ userId, targetType: opportunity|talent, targetId: string, createdAt }`, unique `(userId, targetType, targetId)` + `(userId, targetType, createdAt)` + `(targetType, targetId)` indexes) and register it in `AppModule` without editing peer modules
- [x] 1.2 Add DTOs (opportunity id param validation, username param, `GET /favorites` query with `targetType` filter + cursor `limit`/`cursor`, `lookup` query with `targetType` + 1–50 comma-separated `targetIds`; whitelist + `forbidNonWhitelisted`)

## 2. Toggles

- [x] 2.1 Implement opportunity save/unsave (`POST` 201/200 idempotent with `{ favorited, favoriteCount }`, `DELETE` 204-always; existence check → 404 `OPPORTUNITY_NOT_FOUND`; E11000 collapse for races) with `@Roles('volunteer')`
- [x] 2.2 Implement talent save/unsave by username (server-side username→userId resolution storing userId; POST unknown → 404 `VOLUNTEER_PROFILE_NOT_FOUND`; DELETE unknown → 204) with `@Roles('volunteer')`

## 3. List, counts, lookup

- [x] 3.1 Implement `GET /favorites` (caller-scoped, newest-first, `CursorPage` with `total`/`page`/`pages` via the Session 7 wrapper, `?targetType=` filter, best-effort summaries with `null` fallback)
- [x] 3.2 Implement `GET /favorites/counts` (caller `{ opportunity, talent }` totals) and `GET /favorites/lookup` (`@Public()` + `OptionalJwtAuthGuard`; guests get `favorited: false` + counts; bounds 1–50 with 400 on violation)

## 4. Tests

- [x] 4.1 Unit tests: unique-triple race collapse, username resolution, lookup bounds/key validation, summary-null fallback, isolation scoping
- [x] 4.2 E2E tests: toggle on/off per target type; repeat-POST single row; DELETE-absent 204; list with totals + type filter; counts; lookup authed vs guest (guest counts-only); cross-user isolation; guest toggle 401

## 5. Verification

- [x] 5.1 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`, then `openspec validate backend-v2-favorites` from repo root
- [x] 5.2 Verify index usage with `explain()` on the list/count/lookup queries and confirm no file outside `backend/src/favorites/`, `AppModule` registration, and this change's specs/tests was modified
