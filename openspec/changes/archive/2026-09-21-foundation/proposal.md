## Why

Every later roadmap session (auth, opportunities, verification, ...) needs the same cross-cutting core before any business module exists: config, Mongoose wiring, common guards/filters/pipes, a single status-transition path, audit logging, settings, an in-process event bus, rate limiting, and the external-scheduler job endpoint. Without this foundation each module would reinvent that machinery and the roadmap's "seam" convention (programming against inert defaults owned by later sessions) would have no home.

## What Changes

- Add global infra: `ConfigModule` (env + `.env`), `Logger` with `LOG_LEVEL`, Mongoose root connection, base schema options (timestamps, `versionKey:false`, ObjectId→string `toJSON`), a `Paginated`/cursor helper, a global `HttpExceptionFilter` (`{ statusCode, code, message, details? }`, `UPPER_SNAKE` business codes), `CastError→400`, and the DTO validation pipe.
- Add guards/decorators: `RolesGuard` + `Public` decorator, `CurrentAccount` (user + role) accessor, `SuspendedGuard`, plus an `AuthPlaceholderGuard` seam that later sessions (S2) replace with real JWT.
- Add `StatusTransitionService` with a per-entity whitelist registry (empty now; registered by owning modules) writing `status_histories`.
- Add `AuditInterceptor` writing `audit_logs` for admin actions and sensitive org/volunteer `PATCH/DELETE`.
- Add `SettingsService` over `system_settings` (per-key cache, 30s TTL). Controller deferred to Session 16.
- Add throttler (defaults from `THROTTLE_TTL`/`THROTTLE_LIMIT`) and the `@nestjs/event-emitter` global event bus.
- Add job runner: `POST /api/v1/internal/jobs/run` (`X-Jobs-Key`, constant-time compare; idempotent, single-flight mutex; runs `JobRegistry.handlers` via `Promise.allSettled`; returns `{ ok, ran, results }`). Registry is empty until Sessions 6/7/13.
- Add the three extension seams with inert defaults: `PublishGateService` (S6→S13), `PortfolioQueryService` (S12→S14), `MediaOwnership` (S4/S5→S8). Document the seam convention in `design.md`.
- Add the replica-set `mongodb-memory-server` test rig (`test-db.ts` + `TestApp` helper) and Swagger wiring behind `SWAGGER_ENABLED`.

## Capabilities

### New Capabilities
- `common-core`: config, logging, Mongoose wiring, filters/pipes/guards, throttler, helmet, event bus, Swagger.
- `status-transitions`: `StatusTransitionService` + `status_histories` + whitelist registry.
- `audit-logging`: `AuditInterceptor` + `audit_logs` model.
- `system-settings`: `SettingsService` + `system_settings` model.
- `internal-jobs`: jobs endpoint, idempotent tick, `JobRegistry` seam.
- `extension-seams`: `PublishGateService`, `PortfolioQueryService`, `MediaOwnership` inert defaults + `AuthPlaceholderGuard`.

### Modified Capabilities
<!-- No existing specs: this is the first change. -->

## Impact

- New module tree in `/backend/src/common`, `/backend/src/core` (status/audit/settings/jobs), `/backend/src/seams`.
- New collections: `status_histories`, `audit_logs`, `system_settings`.
- New routes: `POST /api/v1/internal/jobs/run`, `GET /api/v1/health` (bootstrap-only controller already exports health).
- New runtime deps: `@nestjs/config`, `@nestjs/mongoose`, `mongoose`, `@nestjs/throttler`, `@nestjs/event-emitter`, `helmet`, `class-validator`, `class-transformer`, `@nestjs/swagger`. Dev dep: `mongodb-memory-server`.
- Env vars: `PORT`, `NODE_ENV`, `MONGO_URI`, `LOG_LEVEL`, `SWAGGER_ENABLED`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `JOBS_KEY`, `CORS_ORIGIN`.
- No state transitions registered yet; no business schemas beyond the three core collections.