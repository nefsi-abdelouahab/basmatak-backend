## Context

No `/frontend` tree exists; the v2 backend is archived (35/35 specs, zero active changes) with the frozen contract: base `/api/v1`, cursor pagination, `{ statusCode, code, message, details? }` errors, `registryId` display-only. Design source is `design/` (33 screens + `system-design.md`: violet `#6D28D9`, green = verification only, amber = pending only, Plex Sans Arabic + Inter, desktop-first 1440px 3-col, no gradients/glass). F0 is the strict gate for all of §FB–FF: it must ship scaffold, the 4 mandates as enforceable code, shell + system screens, and primitives — structure only for 401/429 (copy lands in FB/F1). Owner decision: per-area message catalogs merged by next-intl config, not one global pair.

## Goals / Non-Goals

**Goals:**

- Reproducible scaffold (`app/[locale]`, `lib/api`, `hooks`, `components/ui`, `messages`, `theme`) with build/lint/test/e2e green on day one.
- Mandates as code: theme tokens, per-area i18n + RTL, single axios + Query layer, 3-breakpoint shell.
- Auth plumbing (storage, 401 refresh-and-retry, refresh-fail logout) and 6 code-bound system screens.
- Frozen primitive set + `hooks/CONVENTIONS.md` + `openspec/config.yaml` frontend context.

**Non-Goals:**

- Any domain route beyond shell + system screens; any domain hook or `lib/api/<domain>.ts` (FB–FF own those).
- 401/429 user-facing copy (structure only here; FB/F1 binds copy).
- Hosting/deploy (deferred to placeholder F20).

## Decisions

- **Next.js App Router + `src/` layout over pages router.** Rationale: roadmap mandates `app/[locale]` routing and per-section route-group disjointness; App Router gives locale layouts + route groups natively. Alternative (pages + custom locale prefix) rejected: more bespoke routing code for later sessions to work around.
- **CSS variables + Tailwind config extension over Tailwind-only or CSS-in-JS.** Rationale: DESIGN.md tokens must be readable both as vars (runtime/RTL docs) and as Tailwind utilities (authoring speed); grep gate stays trivial. Alternative (pure Tailwind arbitrary values) rejected: invites hardcoding.
- **Per-area catalogs merged by config over single en/ar pair.** Rationale: owner-confirmed; gives each session a disjoint key-prefix area so FB–FF never collide in one file. Alternative (single pair) rejected by owner.
- **One axios instance + interceptors over per-module clients.** Rationale: single place for JWT attach, exactly-once refresh-and-retry with request queueing (concurrent 401s share one refresh), unified error map, one blob helper — directly answers reconciliation risk §G#2. Alternative (per-domain instances) rejected: divergent retry/error behavior.
- **TanStack Query for all server state; key factory `['domain','entity','params-hash']`.** Rationale: cursor pagination (`limit` default 20/max 50), `total/page/pages` banners, and favorites `lookup` all need shared cache semantics; factory makes keys deterministic and session-namespaced. Alternative (SWR/React state) rejected: no standardized key ownership for 19 sessions.
- **Tokens in memory + httpOnly-friendly storage abstraction over raw localStorage reads in components.** Rationale: storage module behind an interface keeps refresh/logout atomic and lets later hardening (httpOnly cookies) land without touching call sites. Tokens TTL 1 h; phone `/^\+?[0-9]{8,15}$/`, password 8–72 enforced at forms later.
- **Code-bound system screens (map on backend `{code}`) over HTTP-status-only screens.** Rationale: backend distinguishes `FORBIDDEN`/`ACCOUNT_SUSPENDED`/`ACCOUNT_INACCESSIBLE`/`EMAIL_NOT_VERIFIED` and 503-maintenance via `GET /system/status`; status-only screens would collapse them (the exact gap reconciliation §B#33 flags).

## Risks / Trade-offs

- [Stale names copied from old reconciliation §G#1] → Mitigation: endpoint paths in specs/tasks taken from §A current names; grep-able single `lib/api` surface per domain later.
- [Concurrent 401 storm triggers parallel refreshes] → Mitigation: single-flight refresh with queued retry; exactly-once `POST /auth/refresh`.
- [Per-area catalog merge misconfiguration drops keys] → Mitigation: boot-time missing-key check fails fast in dev/test; coverage test asserts en/ar parity per area.
- [RTL logical-property gaps at 390px] → Mitigation: Playwright en↔ar mirror checks at 1440/1100/390; docs note on logical properties in conventions.
- [Primitive drift (sessions editing `ui/*`)] → Mitigation: frozen-after-F0 rule with declared-exception process; later sessions only consume.

## Migration Plan

Greenfield: no migration, no rollback beyond discarding `/frontend`. Deploy N/A (local `build`/`dev`/`test` only). Gate to FB: scaffold + mandates + shell + system screens verified (build/lint/test/e2e + `openspec validate frontend-foundation`), then archive before any FB session starts.

## Open Questions

- None blocking. Minor: exact Playwright viewport list is fixed (1440/1100/390) — tablet band 1024–1279 represented by 1100. Storage backend (memory vs httpOnly cookie) finalized at implementation within the storage-abstraction interface.
