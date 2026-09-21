## Context

This is the foundation for the Basmatak Tatatoua (بصمتك تطوع) backend, a volunteer marketplace (NestJS + TypeScript strict + MongoDB/Mongoose). It is the first OpenSpec change (Session 1, depends on the Session 0 bootstrap). Every later session (S2–S21) builds on this core, so the design must be careful about seams: several capabilities are *owned* by later sessions (media in S8, publish gate math in S13, portfolio reads in S14, real JWT in S2), yet earlier sessions need to program against them. Constraints: free tier only (no Redis/queues/push/SMS), single instance (in-memory throttler + in-process events are correct), replica-set-capable MongoDB (Atlas M0), external scheduler calling `POST /internal/jobs/run`.

Source of truth: `backend-inventory.md` (repo root). Roadmap Session 1 (docs/ROADMAP.md §4) defines the concrete scope. OpenSpec schema `spec-driven`.

## Goals / Non-Goals

**Goals:**
- Global infra that later sessions never re-invent: config, logger, Mongoose root + base schema, filters, pipes, guards, throttler, helmet, event bus, Swagger.
- One status-transition path (`StatusTransitionService` + `status_histories`) that every state machine uses.
- `audit_logs` interceptor + `system_settings` service.
- `POST /api/v1/internal/jobs/run` with a public `JobRegistry` (extension seam home) that stays idempotent and single-flight.
- The three documented extension seams (publish gate, portfolio queries, media ownership) with inert defaults, plus an `AuthPlaceholderGuard` replaced in S2.
- A replica-set `mongodb-memory-server` test rig — the only DB rig for all future unit + e2e tests — proving Mongo transactions locally.
- Swagger behind `SWAGGER_ENABLED`.

**Non-Goals:**
- No business module/schema beyond `status_histories`, `audit_logs`, `system_settings`.
- No registered transition whitelists, no job handlers, no settings controller (S16), no admin endpoints (S15/S16), no real JWT (S2), no real publish-gate math (S13), no real media (S8), no real portfolio reads (S14).
- No seed data, no deployment config, no external-scheduler setup (S20).

## Decisions

### D1. Module layout mirrors the inventory
`src/common/` (filters, pipes, guards, decorators, interceptors, pagination), `src/core/` (status-transitions, audit, settings, jobs), `src/seams/` under `src/common/seams/`. Rationale: matches inventory §1 modules 1/2/23 and keeps "core" distinct from "business". Alternative rejected: one flat `src/core` module — would blur guards vs services.

### D2. `StatusTransitionService` is pure validation + history write, not enforcement
`assert(entityType, entityId, from, to, actor)` validates the whitelist, writes `status_histories`, returns the entry. It does not mutate the entity; owning modules (S6/S7/S10/S11) perform the state change and *then* call `assert`. Rationale: keeps the service reusable across transactions (S7/S11 need history writes *inside* a `ClientSession`), so `assert` accepts an optional session and the history repository is injectable. Alternative rejected: service mutates entities — couples it to every schema and breaks transaction use.

### D3. Error envelope `{ statusCode, code, message, details? }`
The global filter derives `code` from a business-code mechanism (custom `AppError`/`BusinessException` carrying `code`), validates DTO errors with a dedicated shape, and maps `CastError → 400 INVALID_ID`. Business codes are `UPPER_SNAKE` per inventory §0. Rationale: one consistent contract for the frontend from session one. Alternative rejected: returning raw mongoose/http errors — inconsistent and leaks internals.

### D4. Guards composable rather than one mega-guard
`RolesGuard` (role via `CurrentAccount` claim), `Public` decorator (metadata skip), `SuspendedGuard` (rejects `suspended`, 403 `ACCOUNT_SUSPENDED`), `AuthPlaceholderGuard` (injects `req.token` placeholder; replaced by real JWT guard in S2). Rationale: each later session composes the exact guard combination it needs without forking core. Alternative rejected: a monolithic auth guard — can't express "public role" or "suspended check only".

### D5. In-memory throttler + in-process event bus are correct by constraint
Single-instance Render free ⇒ in-memory Throttler storage and `@nestjs/event-emitter` are production-correct, not dev-only hacks. Domain events are documented in one place (a named-event constant map) so S6–S13 emit/consume deterministically. Rationale: inventory §0/§10 explicitly outlaws Redis/queues.

### D6. Jobs runner: registry + single-flight mutex + `Promise.allSettled`
`JobRegistry.handlers[]` is a public array modules push into. A per-process mutex makes concurrent `run` calls execute handlers once; each handler runs via `Promise.allSettled` so a failing handler doesn't stop the rest; response `{ ok, ran, results }`. `X-Jobs-Key` compared with `timingSafeEqual`. Rationale: idempotency is a *property of each handler's query*, the runner only guarantees no double-execution and no cross-handler failure. Alternative rejected: `@nestjs/schedule` — forbidden (free host sleeps).

### D7. Seams are interfaces + inert default providers in `src/common/seams/`
`PublishGateService` (S6 call → A7-default: unlocked unless `PUBLISH_GATE_ENABLED=true`, then locked/`PUBLISH_GATE_LOCKED` for the demo path), `PortfolioQueryService` (empty-but-correct shapes until S14), `MediaOwnership` (ObjectId-format check now, existence/ownership in S8), `AuthPlaceholderGuard` (→ S2). The design doc is the convention contract: owning sessions swap providers via DI, never by editing the dependent module. Rationale: roadmap F9 made ordering seams mandatory; formalizing them keeps swaps mechanical.

### D8. Test rig is a replica-set `mongodb-memory-server`
`test/utils/test-db.ts` boots `MongoMemoryServer` with `instance: { replSet: { count: 1 } }` and a `TestApp` helper using `Test.createTestingModule` + `MongooseModule.forRootAsync` against it. All unit/e2e tests use this rig. A smoke test runs `connection.startSession()` + `withTransaction` to prove transactions work — the green light S7/S11 rely on. Rationale: A3 maps Atlas M0 (replica set) ⇒ transactions must be exercised in CI, not just manually; in-memory mongod is disposable and free.

### D9. Swagger behind `SWAGGER_ENABLED`, tags per module
The UI mounts only when `SWAGGER_ENABLED=true`; tags grouped per module so later sessions append their controllers without touching boot wiring. Rationale: keeps prod surface minimal while making API exploration easy in dev.

## Risks / Trade-offs

- [Transition logic is other sessions' responsibility] → Mitigation: design.md + proposal document that `assert` never mutates; unit tests pin the contract now.
- [Placeholder auth could mask authorization gaps] → Mitigation: placeholder is deterministic and clearly named `AuthPlaceholderGuard`; S2 replaces it and its e2e suite.
- [In-memory throttler/events assume single instance] → Mitigation: accepted by free-tier constraint (A9); deployment is a single Render instance.
- [`mongodb-memory-server` binary / platform issues on Windows] → Mitigation: version-pinned devDependency; the rig is one isolated module so a fallback (local mongod) can be swapped without touching tests.
- [Seam defaults drift from real providers] → Mitigation: each seam's default is the documented contract (A5/A7/F9); the owning session's spec asserts the replaced provider's behavior.
- [Everything compiled before S2 may rely on placeholder identity] → Mitigation: guards read `req.token` only; no fake secrets shipped.

## Migration Plan

First change in the repo: nothing to migrate. Rollback = drop the foundation commit; later sessions depend on it and are ordered strictly (roadmap §1).

## Open Questions

- None blocking. (Datetime + TZ defaults for status history and audit timestamps default to Mongo server time; confirm display formatting in the frontend sessions.)