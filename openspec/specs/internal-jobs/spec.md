# internal-jobs Specification

## Purpose
The `POST /internal/jobs/run` idempotent tick endpoint (guarded by the `X-Jobs-Key` secret) that starts opportunities and activates participants at `startDate`; the seam seeded for future reliability recomputation. Called by an external free scheduler.
## Requirements
### Requirement: Internal jobs endpoint
The system SHALL expose `POST /api/v1/internal/jobs/run` that executes the registered job handlers, guarded by the `X-Jobs-Key` header compared in constant time against the `JOBS_KEY` env var.

#### Scenario: Missing key rejected
- **WHEN** `POST /internal/jobs/run` is called without an `X-Jobs-Key` header
- **THEN** the response is `401` (or `403`) and no handlers run

#### Scenario: Wrong key rejected
- **WHEN** `POST /internal/jobs/run` is called with an `X-Jobs-Key` that does not match `JOBS_KEY`
- **THEN** the response is `401` (or `403`) and no handlers run

#### Scenario: Correct key runs handlers
- **WHEN** `POST /internal/jobs/run` is called with a matching `X-Jobs-Key`
- **THEN** every registered handler in `JobRegistry` runs
- **AND** the response is `200` with `{ ok: true, ran: <count>, results: [ ... ] }`

### Requirement: Job registry seam
The system SHALL expose a public `JobRegistry` whose `handlers[]` is empty at bootstrap and to which later sessions register handlers.

#### Scenario: Empty at bootstrap
- **WHEN** the foundation application boots
- **THEN** `JobRegistry.handlers` is empty, so a jobs run reports `ran: 0`

#### Scenario: Registration by later sessions
- **WHEN** a module registers a handler (e.g. an opportunity start ticker)
- **THEN** subsequent jobs runs execute that handler and report it per handler in `results`

### Requirement: Idempotent, isolated job execution
The system SHALL run handlers with `Promise.allSettled` so one failing handler does not stop the others, and SHALL guard concurrent runs with a per-process mutex (single-flight).

#### Scenario: Single-flight mutex
- **WHEN** two `run` calls arrive concurrently
- **THEN** only one executes the handlers and the other waits for / reuses the in-flight result

#### Scenario: Partial failure isolated
- **WHEN** one handler rejects while others resolve
- **THEN** the others still run
- **AND** the response reports per-handler success or failure in `results` with `ok: true`

### Requirement: Health pulse for external schedulers
The system SHALL respond to a jobs run as the warm-up/pulse endpoint for free external schedulers, consistently with the public health endpoint.

#### Scenario: Warm-up call succeeds
- **WHEN** the external scheduler calls `POST /internal/jobs/run` with the correct key
- **THEN** it receives a `200` response even when no handlers are registered

