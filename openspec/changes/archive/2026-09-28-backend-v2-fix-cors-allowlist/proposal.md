## Why

`POST /api/v1/auth/register/organization` from `http://localhost:3000` fails
its CORS preflight ("No 'Access-Control-Allow-Origin' header"). Root cause:
`main.ts` passes `CORS_ORIGIN.split(',')` straight to `enableCors`, so the
`.env` value `*` becomes the literal array `["*"]` — the `cors` package only
honours `*` as a bare string/`true`, never as an array member, so **every**
origin is denied. There is also no trimming, no trailing-slash normalization,
no startup visibility into the effective value, and `exposedHeaders` is unset
(CSV/PDF `Content-Disposition` filenames are unreadable cross-origin).

## What Changes

- New `src/common/cors/cors-options.ts`: `parseCorsOrigins()` (split on
  commas, trim, strip trailing slashes, drop empties and bare `*` with a
  warning) + `buildCorsOptions()` pinning methods
  `GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`, allowed headers
  `Content-Type,Authorization,Accept`, and `exposedHeaders:
  ['Content-Disposition']`.
- `main.ts` uses the builder and logs the effective allowlist at startup.
- `backend/.env` (local, gitignored): `CORS_ORIGIN=http://localhost:3000`
  (explicit, no wildcard). `.env.example` documents the explicit-list rule.
- No endpoint, auth, or response-body change.

## Capabilities

### New Capabilities

- None (hardening only; no user-facing behavior besides the fixed preflight).

### Modified Capabilities

- `common-core`: bootstrap CORS wiring moves from raw `CORS_ORIGIN.split(',')`
  to a normalized explicit allowlist with startup logging and pinned
  methods/headers/exposed headers.

## Impact

- Backend-only: 1 new module + spec, `main.ts` wiring, local `.env` value.
  `CORS_ORIGIN=*` anywhere now warns and is dropped (fail-closed, no wildcard).
