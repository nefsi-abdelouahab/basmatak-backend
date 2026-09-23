## MODIFIED Requirements

### Requirement: Bootstrap configuration
The system SHALL load environment configuration from `process.env` and an optional `.env` file via `@nestjs/config`, exposing typed configuration for the app settings used across modules.

#### Scenario: Config loads from env
- **WHEN** the application boots with environment variables set
- **THEN** the configuration service exposes those values to all modules

#### Scenario: Defaults when env is unset
- **WHEN** `MONGO_URI` is unset
- **THEN** the Mongoose connection uses the local dev default `mongodb://127.0.0.1:27017/basmatak`
- **AND** `PORT` defaults to a sensible development port

#### Scenario: Platform-injected port in production
- **WHEN** the application runs with `NODE_ENV=production` and `PORT` is set by the hosting platform (Render)
- **THEN** the app listens on that `PORT` value (`process.env.PORT`) instead of the development default

### Requirement: Health endpoint
The system SHALL expose `GET /api/v1/health` returning service liveness, including as the warm-up probe for the free hosting platform and external scheduler.

#### Scenario: Liveness response
- **WHEN** `GET /api/v1/health` is called
- **THEN** it returns `200` with `{ status: 'ok', version }`

#### Scenario: Render and scheduler warm-up in production
- **WHEN** the application runs with `NODE_ENV=production` and Render (or the keep-alive workflow) pings `GET /api/v1/health`
- **THEN** it answers `200` with `{ status: 'ok', version }` and no secret values in the response or headers