## Why

Volunteer feed cards, opportunity details, and the talent directory all render Save/bookmark actions (RP §1.1#2, §1.2#6, §1.3#7; owner decision 13), but no backend persists them. This change adds the standalone favorites capability behind those buttons: plain toggle + list, no recommendation logic.

## What Changes

- New `favorites` module (own directory `backend/src/favorites/`, no edits to existing modules):
  - `POST /favorites/opportunities/:id` / `DELETE /favorites/opportunities/:id` (Vol) — idempotent save/unsave (POST twice → one row; DELETE absent → 204).
  - `POST /favorites/talents/:username` / `DELETE /favorites/talents/:username` (Vol) — same semantics, username resolved server-side to the volunteer userId.
  - `GET /favorites` (Vol) — caller's saves across both target types, cursor-paginated with `total`/`page`/`pages`, optional `?targetType=` filter.
  - `GET /favorites/counts` (Vol) — caller's per-type totals `{ opportunity, talent }`.
  - `GET /favorites/lookup?targetType=&targetIds=` (optional auth) — batch card state `{ favorited, favoriteCount }` per target without touching feed payloads.
- New `favorites` collection `{ userId, targetType: opportunity|talent, targetId, createdAt }` + unique `(userId, targetType, targetId)`.
- Guests get 401 on the Vol routes via the existing auth guard (decision 10 — no new logic); on `lookup` guests receive counts with `favorited: false`.
- Out of scope: folders/collections, favoriting orgs, any cross-user visibility of *who* favorited (counts only), AI/ML or recommendations.

## Capabilities

### New Capabilities
- `favorites`: bookmark toggles, own-list, counts, batch card-state lookup, data model + authz isolation.

### Modified Capabilities
- None. Surfacing `favorited`/`favoriteCount` directly on opportunity/talent read payloads would edit archived-session files (see design Open Questions) and is therefore proposed as a blocked follow-up, not a delta spec in this change.

## Impact

- New code: `backend/src/favorites/` (module, controller, service, schema, DTOs, unit + e2e tests) registered in `AppModule`; no changes to existing modules' routes or schemas.
- Reads `opportunities` (existence) and `volunteer_profiles` (username→userId) via lean queries owned by the new module; writes only to `favorites`.
- No new packages, env vars, or cross-user data exposure; one small indexed collection (Atlas budget negligible).
