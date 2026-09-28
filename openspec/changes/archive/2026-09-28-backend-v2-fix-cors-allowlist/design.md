## Context

`app.enableCors({ origin: process.env.CORS_ORIGIN ? split(',') : true })`:
`"*"` → `["*"]` (literal, matches nothing → deny-all); unset → `true`
(reflect-all → allow-all). Neither is an explicit allowlist; no trimming, no
trailing-slash handling, no startup log, no `exposedHeaders`.

## Goals / Non-Goals

**Goals:**

- Deterministic explicit allowlist; preflight green from listed origins, absent
  header otherwise; `Content-Disposition` readable for downloads.

**Non-Goals:**

- Cookie credentials (Bearer-only API — `credentials` stays off); endpoint or
  auth changes.

## Decisions

- Pure helper module (`parseCorsOrigins` / `buildCorsOptions`) over inline
  `main.ts` logic: unit-testable without booting Nest (64 colocated specs
  already run under `rootDir: src` jest).
- Bare `*` dropped with warning (fail-closed) rather than boot-throw: keeps
  misconfigured boots diagnosable via the startup log line instead of a crash
  loop; the log line makes the effective value always visible.
- `Accept` added beside the required `Content-Type,Authorization`: axios sends
  `Accept` explicitly and it appears in `Access-Control-Request-Headers`, so
  omitting it would fail real preflights.
- `main.ts` keeps owning `enableCors`; only the options source changes.

## Risks / Trade-offs

- [Risk] Existing deploys relying on unset-`CORS_ORIGIN` reflect-all break
  (now deny) → Mitigation: they must set an explicit list; documented in
  `.env.example` and `docs/LOCAL_DEV.md`.
