## ADDED Requirements

### Requirement: Centralized axios instance with JWT attach and 401 refresh-and-retry

The system SHALL route all HTTP through one axios instance that attaches the JWT, intercepts 401 responses to refresh once via `POST /auth/refresh` and retry the original request, and on refresh failure logs out via `POST /auth/logout` and surfaces the session-expired state — per mandate API ACCESS (roadmap §2.3) and reconciliation risk §G#2 (shared authed pattern, not per-screen code).

#### Scenario: 401 triggers single refresh-and-retry

- **WHEN** an API call returns 401 and the refresh token is valid
- **THEN** the client calls `POST /auth/refresh` exactly once, retries the original request with the new token, and delivers its result transparently

#### Scenario: Refresh failure logs out

- **WHEN** the refresh attempt fails (invalid/expired refresh token)
- **THEN** the client calls `POST /auth/logout`, clears stored tokens, and routes to the session-expired state without retry loops

### Requirement: Unified error shape with 429/503 surfacing

The system SHALL map every failure to the unified shape `{ statusCode, code, message, details? }` derived from the backend envelope, with explicit bindings for 401/403/404/429/503 including `RATE_LIMITED` and maintenance signalling from `GET /system/status`.

#### Scenario: Error-mapper covers all codes

- **WHEN** unit tests feed representative 401/403/404/429/503 payloads through the mapper
- **THEN** each maps to the correct UI error state (session-expired / forbidden-variant / not-found / rate-limited / maintenance) with no unmapped fallthrough except a neutral 500

### Requirement: Single authed blob-download helper

The system SHALL download all streamed exports (attestation PDFs, `format=csv` archives) through one shared authed helper using `responseType: blob` honoring `Content-Disposition: attachment`, never storing or expecting a file URL — per reconciliation risk §G#2.

#### Scenario: Blob download attaches auth and triggers save

- **WHEN** a caller requests a streamed export through the helper with a valid session
- **THEN** the request carries the JWT, the response is handled as a blob with the server-provided filename, and no navigation or URL-persistence occurs

### Requirement: TanStack Query provider with key factory and hook-file conventions

The system SHALL provide one Query provider plus a query-key factory (`hooks/CONVENTIONS.md`, short: one hook file per session, keys namespaced per domain), and components SHALL fetch only via TanStack Query hooks calling one typed function per backend endpoint in `lib/api/*` — no ad-hoc `fetch(`/raw `axios.` outside `lib/api`.

#### Scenario: Key factory produces stable namespaced keys

- **WHEN** unit tests build keys for list/detail/mutation shapes of a domain
- **THEN** keys are deterministic, namespaced, and encode filters/pagination so caches never collide across domains

#### Scenario: No ad-hoc fetching outside lib/api

- **WHEN** the API-layer audit greps `src/` for `fetch(` and raw `axios.`
- **THEN** zero occurrences exist outside `src/lib/api`
