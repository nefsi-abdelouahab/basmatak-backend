## MODIFIED Requirements

### Requirement: Bootstrap configuration

The system SHALL load environment configuration from `process.env` and an
optional `.env` file via `@nestjs/config`, exposing typed configuration for
the app settings used across modules. The CORS allowlist SHALL be parsed from
`CORS_ORIGIN` as an explicit list: split on commas, trimmed, trailing slashes
stripped, empty entries dropped, and bare `*` entries dropped with a startup
warning (no wildcard mode). The effective allowlist SHALL be logged at startup.
Preflight responses SHALL allow methods
`GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`, request headers
`Content-Type,Authorization,Accept`, and SHALL expose `Content-Disposition`
for streamed CSV/PDF downloads.

#### Scenario: Config loads from env

- **WHEN** the application boots with environment variables set
- **THEN** the configuration service exposes those values to all modules

#### Scenario: Explicit allowlist passes preflight

- **WHEN** `CORS_ORIGIN` is `http://localhost:3000` and the browser preflights
  `POST /api/v1/auth/register/organization` from that origin
- **THEN** the response carries `Access-Control-Allow-Origin:
  http://localhost:3000` with the pinned methods and headers

#### Scenario: Unlisted origin gets no allow-origin header

- **WHEN** a preflight arrives from an origin not in the allowlist
- **THEN** the response carries no `Access-Control-Allow-Origin` header

#### Scenario: Messy values normalize

- **WHEN** `CORS_ORIGIN` is `" https://app.example.com/, http://localhost:3000/ "`
- **THEN** the effective allowlist is exactly
  `["https://app.example.com", "http://localhost:3000"]`

#### Scenario: Wildcard is fail-closed

- **WHEN** `CORS_ORIGIN` is `*` or unset/empty
- **THEN** a startup warning is logged and cross-origin requests are denied
  (no `Access-Control-Allow-Origin` header), instead of silently denying all
  (old `["*"]` behavior) or silently allowing all

#### Scenario: Downloads expose their filenames

- **WHEN** an authed client downloads a CSV/PDF export cross-origin
- **THEN** `Content-Disposition` is readable via `Access-Control-Expose-Headers`
