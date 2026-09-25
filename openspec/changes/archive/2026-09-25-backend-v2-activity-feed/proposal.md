## Why

Organization dashboards and org profiles need a per-account activity stream (RP §2.1#10, §2.8#12), and volunteers need the same for their apply/accept/verify journey. Today those events are scattered across `status_histories` and `notifications` with no unified chronological view.

## What Changes

- New `activity` module (own directory `backend/src/activity/`, no shared-file edits):
  - `GET /organizations/me/activity` (Org) — publish/close/start-review/verification-decision events across the org's opportunities, with entity summaries.
  - `GET /volunteers/me/activity` (Vol) — apply/accept/start/verify events plus record issuance for the caller.
- Unified item shape `{ type, title, ts, entity: { type, id, name, slug?, summary } }`, newest-first, cursor-paginated via the Session 7 `execPage` wrapper (`CursorPage` with `total`/`page`/`pages`).
- Entity summaries composed from lightweight reads (opportunity title, org name, volunteer name, submission state); transactional notification + history pairs deduped so one event appears once.
- Computed read over existing collections — **no new collection**, no writes, no push/real-time, plain chronological ordering only (no AI/ML ranking).
- Out of scope: volunteer dashboard `latestVerifiedExperience` card (Session 14), cross-entity aggregation beyond the two streams, label embeds on other payloads (S7).

## Capabilities

### New Capabilities
- `activity-feed`: per-account activity streams (routes, item shape, merge/order/dedupe, authz scoping, pagination).

### Modified Capabilities
- None (read-only aggregation; no requirement changes to `notifications`, `status-transitions`, or entity modules).

## Impact

- New code: `backend/src/activity/` (module, controller, service, DTOs, unit + e2e tests) wired into `AppModule`; no changes to existing modules' routes or schemas.
- Reads `status_histories`, `notifications`, `applications`, `submissions`, `opportunities`, `organizations`, `volunteer_profiles`; writes none.
- No new packages, env vars, or collections; no 512 MB Atlas budget impact.
