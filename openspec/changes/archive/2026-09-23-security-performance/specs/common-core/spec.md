# common-core Specification Change

## Purpose

Session 19 hardening (ROADMAP lines 858+): make throttling defaults explicit and require stricter per-route limits on credential/abuse-prone routes, gate Swagger strictly to non-production environments, make the Helmet/Content-Security-Policy posture explicit, and forbid leaking secret environment values into logs, responses, or headers.

## Requirements

## MODIFIED Requirements

### Requirement: Rate limiting
The system SHALL enable `@nestjs/throttler` with defaults from `THROTTLE_TTL` and `THROTTLE_LIMIT` (defaults `60` and `100`), supporting per-controller `@Throttle` overrides. Credential and abuse-prone routes — `login`, `forgot-password`, `resend-verification`, media upload/link/confirm, and `POST /reports` — SHALL apply stricter per-route `@Throttle` overrides than the global defaults.

#### Scenario: Excess requests throttled
- **WHEN** a caller exceeds the configured limit within the TTL window
- **THEN** the response is `429`

#### Scenario: Per-route override
- **WHEN** a controller sets `@Throttle` with stricter limits (e.g. login)
- **THEN** those limits apply instead of the global defaults

#### Scenario: Stricter routes fire before the global default
- **WHEN** a caller hits the per-route limit on a credential/abuse-prone route while still under the global default
- **THEN** the response is `429`

### Requirement: Swagger documentation
The system SHALL wire `@nestjs/swagger` behind `SWAGGER_ENABLED` so the OpenAPI UI is served only when enabled, and SHALL NOT serve it when `NODE_ENV=production`. When Swagger is served, the configured Content-Security-Policy SHALL additionally permit the Swagger UI assets.

#### Scenario: Disabled by default
- **WHEN** `SWAGGER_ENABLED` is unset or `false`
- **THEN** the Swagger UI route is not exposed

#### Scenario: Enabled explicitly
- **WHEN** `SWAGGER_ENABLED=true` and `NODE_ENV` is not `production`
- **THEN** the Swagger UI is served and lists documented tags per module

#### Scenario: Production never serves Swagger
- **WHEN** `NODE_ENV=production` even with `SWAGGER_ENABLED=true`
- **THEN** the Swagger UI route is not exposed

### Requirement: Security headers
The system SHALL apply `helmet` security headers globally with a Content-Security-Policy configured explicitly. In production the CSP SHALL NOT authorize third-party origins beyond the strict environment defaults; when Swagger is served in a non-production environment the CSP SHALL additionally allow the Swagger UI assets. Secret values SHALL never appear in response headers.

#### Scenario: Headers present
- **WHEN** any HTTP response is returned
- **THEN** standard security headers (e.g. `X-Content-Type-Options: nosniff`) are present

#### Scenario: Strict CSP by default
- **WHEN** the application serves responses with Swagger disabled
- **THEN** the `Content-Security-Policy` header reflects the strict defaults and does not authorize third-party origins

## ADDED Requirements

### Requirement: Secret hygiene
The system SHALL NOT log the values of secret environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JOBS_KEY`, `MONGO_URI`, Supabase URL/anonymity keys, mail user/password) nor include them in error responses, headers, or response payloads; logs SHALL reference such variables by name only. This SHALL be guarded by a codebase-wide grep audit and a boot-time assertion in the test suite that verifies logs emitted during bootstrap contain no secret values.

#### Scenario: Boot logs contain no secret values
- **WHEN** the application boots with real-looking secret values configured
- **THEN** the boot-time logs do not contain those values

#### Scenario: No `process.env` read feeds a log or response
- **WHEN** the source code is scanned for `process.env` reads
- **THEN** every read feeds a runtime dependency (configuration or secrets), never an interpolated log string or a response payload