## 1. Test rig

- [ ] 1.1 Create `backend/test/utils/test-db.ts`: boot a `MongoMemoryServer` with `instance: { replSet: { count: 1 } }`, yield a `mongoose.Connection`, and provide a `TestApp` helper that bootstraps a Nest app via `Test.createTestingModule` with `MongooseModule.forRootAsync` pointed at the memory server
- [ ] 1.2 Add a transaction smoke test that runs `connection.startSession()` + `withTransaction` against the in-memory replica set (proves the green light for S7/S11 transactions)

## 2. Global infrastructure module

- [ ] 2.1 Install the session's runtime deps: `@nestjs/config`, `@nestjs/mongoose`, `mongoose`, `@nestjs/throttler`, `@nestjs/event-emitter`, `helmet`, `class-validator`, `class-transformer`, `@nestjs/swagger`; dev dep `mongodb-memory-server` (`npm i @nestjs/config @nestjs/mongoose mongoose @nestjs/throttler @nestjs/event-emitter helmet class-validator class-transformer @nestjs/swagger`; `npm i -D mongodb-memory-server`)
- [ ] 2.2 Implement the `ConfigModule` init (env + `.env`) reading this session's vars (`PORT`, `NODE_ENV`, `MONGO_URI`, `LOG_LEVEL`, `SWAGGER_ENABLED`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `JOBS_KEY`, `CORS_ORIGIN`) with defaults (local `mongodb://127.0.0.1:27017/basmatak` when `MONGO_URI` unset, dev port default)
- [ ] 2.3 Add the app-wide `Logger` service honoring `LOG_LEVEL`
- [ ] 2.4 Register the Mongoose root connection with `MongooseModule.forRootAsync`
- [ ] 2.5 Add the base schema helper (timestamps, `versionKey: false`, `toJSON` transform `ObjectId → string`) and a `Paginated`/cursor helper (default limit 20, max 50)
- [ ] 2.6 Enable throttler from `THROTTLE_TTL`/`THROTTLE_LIMIT` (in-memory storage) with `@Throttle` override support
- [ ] 2.7 Register the `@nestjs/event-emitter` global bus with a documented named-event constant map (inventory §2.17/§0 event list)
- [ ] 2.8 Apply `helmet` and CORS from `CORS_ORIGIN` globally

## 3. Filters, pipes and guards

- [ ] 3.1 Implement the global `HttpExceptionFilter` producing `{ statusCode, code, message, details? }` with `UPPER_SNAKE` business codes and a `BusinessException` carrying codes
- [ ] 3.2 Map Mongoose `CastError → 400 INVALID_ID` (no 500s for bad ObjectIds)
- [ ] 3.3 Register the validation pipe with `whitelist`, `forbidNonWhitelisted`, `transform`
- [ ] 3.4 Implement `RolesGuard`, `Public` decorator, and `CurrentAccount` accessor reading `req.token.role` (role claim set by the S2 JWT strategy; placeholder for now)
- [ ] 3.5 Implement `SuspendedGuard` rejecting `users.status=suspended` (403 `ACCOUNT_SUSPENDED`) and allowing `active`
- [ ] 3.6 Implement the `AuthPlaceholderGuard` seam that injects a `req.token` placeholder so protected routes work before S2 wires real tokens

## 4. Status transitions

- [ ] 4.1 Create the `status_histories` model with the `(entityType, entityId, createdAt)` index
- [ ] 4.2 Implement `StatusTransitionService.assert(entityType, entityId, from, to, actor, session?)`: validates against the per-entity whitelist map, writes `status_histories` (optionally inside a `ClientSession`), returns the entry; throws `INVALID_STATUS_TRANSITION` for disallowed pairs and a not-registered error for unknown entity types
- [ ] 4.3 Add the per-entity whitelist registry (empty at bootstrap) and unit tests: valid transition writes history; invalid throws `INVALID_STATUS_TRANSITION`; unknown type fails with not-registered

## 5. Audit logging

- [ ] 5.1 Create the `audit_logs` model with indexes on `(entityType, entityId)`, `actorId`, `createdAt`
- [ ] 5.2 Implement the `AuditInterceptor` writing `audit_logs` for admin actions and `PATCH`/`DELETE` on org/volunteer resources; public reads never audited

## 6. System settings

- [ ] 6.1 Create the `system_settings` model with a unique `key` index
- [ ] 6.2 Implement `SettingsService` (read/upsert, per-key cache with 30s TTL, defaults for missing keys; no controller this session) and unit tests for cache/upsert behavior

## 7. Jobs runner

- [ ] 7.1 Implement the public `JobRegistry` with an empty `handlers[]` (later sessions register handlers)
- [ ] 7.2 Implement the internal jobs controller `POST /api/v1/internal/jobs/run` guarding `X-Jobs-Key` with `timingSafeEqual` against `JOBS_KEY`; run handlers via `Promise.allSettled` with a per-process single-flight mutex; return `{ ok, ran, results }`
- [ ] 7.3 Unit test the mutex: concurrent `run` calls execute the registered handlers exactly once

## 8. Extension seams

- [ ] 8.1 Implement `PublishGateService` (interface + inert default): unlocked unless `PUBLISH_GATE_ENABLED=true`, otherwise `PUBLISH_GATE_LOCKED` for the demo path
- [ ] 8.2 Implement `PortfolioQueryService` (interface + inert default returning empty-but-correct shapes)
- [ ] 8.3 Implement the `MediaOwnership` helper (validates ObjectId format; real existence/ownership deferred to S8)
- [ ] 8.4 Document the seam convention (interface + inert default in `src/common/seams/`, swapped via DI by the owning session) in `design.md`

## 9. Swagger wiring

- [ ] 9.1 Wire `@nestjs/swagger` behind `SWAGGER_ENABLED` with per-module tag groups; OFF when unset/false

## 10. Bootstrap wiring and env

- [ ] 10.1 Ensure `GET /api/v1/health` returns `{ status: 'ok', version }` (bootstrap-only controller from Session 0)
- [ ] 10.2 Update `backend/.env.example` filling values/comments for this session's vars (`PORT`, `NODE_ENV`, `MONGO_URI`, `LOG_LEVEL`, `SWAGGER_ENABLED`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `JOBS_KEY`, `CORS_ORIGIN`); leave the rest blank

## 11. Tests and verification

- [ ] 11.1 E2E: `/internal/jobs/run` rejects missing/wrong `X-Jobs-Key`; with the correct key and a registered test handler it runs and is idempotent
- [ ] 11.2 E2E: unknown ObjectId route returns `400` with the `{ statusCode, code, message }` error shape
- [ ] 11.3 Run `npm run build && npm run lint && npm test && npm run test:e2e` from `/backend` until all green
- [ ] 11.4 From the repo root run `openspec validate foundation` (valid) and `openspec status --change foundation` (all artifacts done)