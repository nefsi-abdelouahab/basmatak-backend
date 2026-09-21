# common-core Specification

## Purpose
TBD - created by archiving change foundation. Update Purpose after archive.
## Requirements
### Requirement: Bootstrap configuration
The system SHALL load environment configuration from `process.env` and an optional `.env` file via `@nestjs/config`, exposing typed configuration for the app settings used across modules.

#### Scenario: Config loads from env
- **WHEN** the application boots with environment variables set
- **THEN** the configuration service exposes those values to all modules

#### Scenario: Defaults when env is unset
- **WHEN** `MONGO_URI` is unset
- **THEN** the Mongoose connection uses the local dev default `mongodb://127.0.0.1:27017/basmatak`
- **AND** `PORT` defaults to a sensible development port

### Requirement: Logging with configurable level
The system SHALL provide an app-wide `Logger` whose output level is controlled by `LOG_LEVEL`.

#### Scenario: Log level applies
- **WHEN** `LOG_LEVEL` is set to a specific level
- **THEN** only messages at that level and above are emitted by the logger

### Requirement: Mongoose root connection with base schema options
The system SHALL register a root Mongoose connection and a global base schema configuration so that all schemas use timestamps, disable `versionKey`, and transform `ObjectId` fields to strings in `toJSON` output.

#### Scenario: Base options applied
- **WHEN** any mongoose schema is registered through the base schema helper
- **THEN** documents include `createdAt`/`updatedAt`, omit `__v`, and serialize `ObjectId` fields as strings

#### Scenario: ObjectId serialization
- **WHEN** a document's `toJSON` is called
- **THEN** every `ObjectId` field is represented as its 24-character hex string

### Requirement: Cursor pagination helper
The system SHALL provide a `Paginated`/cursor helper that list endpoints use, with default limit 20 and a maximum limit of 50.

#### Scenario: Default and max limits
- **WHEN** a list endpoint is called with a limit
- **THEN** a limit below 1 falls back to the default of 20
- **AND** a requested limit above 50 is capped at 50

#### Scenario: Cursor output shape
- **WHEN** a paginated list is returned
- **THEN** it includes the items, a `nextCursor` when more items exist, and no `nextCursor` otherwise

### Requirement: Global HTTP exception filter
The system SHALL provide a global `HttpExceptionFilter` that serializes every HTTP error as `{ statusCode, code, message, details? }` where `code` is an `UPPER_SNAKE` business code derived from the exception.

#### Scenario: Known business error
- **WHEN** a service throws an error with a business code such as `INVALID_STATUS_TRANSITION`
- **THEN** the filter responds with `{ statusCode, code: 'INVALID_STATUS_TRANSITION', message, details? }`

#### Scenario: Validation error shape
- **WHEN** a `class-validator` validation fails
- **THEN** the response is `422`/`400` with `code` reflecting the validation failure and `details` listing the per-field errors

#### Scenario: CastError maps to 400
- **WHEN** a route receives an invalid ObjectId that produces a Mongoose `CastError`
- **THEN** the response is `400` with a business `code` (e.g. `INVALID_ID`) instead of a `500`

#### Scenario: Unknown error fallback
- **WHEN** an unhandled exception reaches the filter
- **THEN** the response has `statusCode` 500 and a generic message without leaking stack traces

### Requirement: DTO validation pipe
The system SHALL register a global validation pipe with `whitelist`, `forbidNonWhitelisted`, and `transform` enabled so request DTOs reject unknown fields.

#### Scenario: Unknown property rejected
- **WHEN** a request body contains a property not declared on the DTO
- **THEN** the request is rejected with a validation error

#### Scenario: Transform enabled
- **WHEN** a DTO declares typed fields (strings, numbers, enums)
- **THEN** the incoming payload is transformed to those declared types before the handler runs

### Requirement: Roles and public access guards
The system SHALL provide a `RolesGuard` that enforces route roles, a `Public` decorator that marks routes accessible without authentication, and a `CurrentAccount` accessor that exposes the authenticated user and role to controllers.

#### Scenario: Role guard blocks wrong role
- **WHEN** a route is decorated for a role (e.g. `admin`) and the caller has a different role
- **THEN** the request is rejected with a `403`

#### Scenario: Public route bypasses auth
- **WHEN** a route is marked `@Public`
- **THEN** it is reachable without a token regardless of the default auth guard

#### Scenario: Current account accessor
- **WHEN** a handler decorated with `CurrentAccount` runs
- **THEN** it receives the authenticated user identity plus its role

### Requirement: Suspended account guard
The system SHALL reject requests from accounts whose `users.status` is `suspended` (and treat `deleted` accounts as inaccessible), while allowing `active` accounts.

#### Scenario: Suspended user rejected
- **WHEN** a request carries an identity whose `users.status` is `suspended`
- **THEN** the request is rejected with `403` and a business code such as `ACCOUNT_SUSPENDED`

#### Scenario: Active user allowed
- **WHEN** a request carries an identity whose `users.status` is `active`
- **THEN** the guard does not block it

### Requirement: Rate limiting
The system SHALL enable `@nestjs/throttler` with defaults from `THROTTLE_TTL` and `THROTTLE_LIMIT`, supporting per-controller `@Throttle` overrides.

#### Scenario: Excess requests throttled
- **WHEN** a caller exceeds the configured limit within the TTL window
- **THEN** the response is `429`

#### Scenario: Per-route override
- **WHEN** a controller sets `@Throttle` with stricter limits (e.g. login)
- **THEN** those limits apply instead of the global defaults

### Requirement: In-process event bus
The system SHALL register the `@nestjs/event-emitter` global event bus and document the named domain events used across the application.

#### Scenario: Event emitted and handled
- **WHEN** a service emits a named domain event
- **THEN** registered handlers are invoked synchronously in-process for that event name

#### Scenario: Event names documented
- **WHEN** the codebase references a domain event
- **THEN** it uses one of the documented names (e.g. `application.created`, `opportunity.started`, `submission.verified`, `org.verification.updated`, `publish-gate.locked`)

### Requirement: Swagger documentation
The system SHALL wire `@nestjs/swagger` behind `SWAGGER_ENABLED` so the OpenAPI UI is served only when enabled.

#### Scenario: Disabled by default
- **WHEN** `SWAGGER_ENABLED` is unset or `false`
- **THEN** the Swagger UI route is not exposed

#### Scenario: Enabled explicitly
- **WHEN** `SWAGGER_ENABLED=true`
- **THEN** the Swagger UI is served and lists documented tags per module

### Requirement: Security headers
The system SHALL apply `helmet` security headers globally.

#### Scenario: Headers present
- **WHEN** any HTTP response is returned
- **THEN** standard security headers (e.g. `X-Content-Type-Options: nosniff`) are present

### Requirement: Health endpoint
The system SHALL expose `GET /api/v1/health` returning service liveness.

#### Scenario: Liveness response
- **WHEN** `GET /api/v1/health` is called
- **THEN** it returns `200` with `{ status: 'ok', version }`

