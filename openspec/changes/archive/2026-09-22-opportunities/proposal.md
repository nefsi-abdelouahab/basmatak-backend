## Why

Sessions 4–5 built volunteer profiles and organization accounts, but nothing lets an organization offer work: there is no `opportunities` entity, so there is no public feed to browse, orgs cannot publish tasks, and Session 7's application loop has nothing to attach to. The roadmap's core loop (post → apply → accept → start → verify) is unbuildable until tasks exist with a full lifecycle and a `startDate` job tick.

## What Changes

- Add the `opportunities` model via `createSchema`: `organizationId`, unique `slug`, `title`/`description`, `categoryId`, embedded `positions` (`requiredCount`, `filledCount`, `requiredSkills` → skillId refs), `status` (`draft|published|in_progress|completed|closed|cancelled`), `startDate`, `applicationDeadline`, `location { wilayaId, municipalityId, coordinates }`. Indexes per §3: unique `slug`, `(status, startDate)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description`, `positions.requiredSkills.skillId`.
- Register the `opportunity` entity whitelist in `StatusTransitionRegistry` at module bootstrap (the full §5 lifecycle, incl. the `accepted → active` participant activation path).
- Public: `GET /opportunities` feed with filters `q, categoryId, skillId, wilayaId, municipalityId, from, to, hasOpenPositions`, published statuses only, `hasOpenPositions` = ≥1 position with `filledCount < requiredCount`, cursor pagination (default 20, max 50); `GET /opportunities/:idOrSlug` (404 unless published; the owning org reads its own via the `me` routes); `GET /opportunities/recommended` returns an empty list (S6 seam; rules arrive in S12).
- Org: `POST/GET /organizations/me/opportunities`; `PATCH/DELETE /opportunities/:opportunityId` (draft-only delete; after publish only a small editable set and only while no accepted participants); `POST /opportunities/:opportunityId/{publish,close,cancel,complete}` through `StatusTransitionService`; positions CRUD under `/opportunities/:opportunityId/positions...` honouring `requiredCount >= filledCount`.
- Publish guard: only orgs with `verificationStatus=verified` AND `status=active` may publish, else 403 `ORG_NOT_VERIFIED`; publish calls `PublishGateService#evaluate(org)` (inert default unlocks; when `PUBLISH_GATE_ENABLED=true` and the gate reports locked → 409 `PUBLISH_GATE_LOCKED`).
- Job handler `opportunityStartTicker` in the S1 `JobRegistry`: find `{ status: 'published', startDate: { $lte: now } }` → move each to `in_progress`, set their `accepted` participants `active` (idempotent), emit `opportunity.started`.
- Add `PUBLISH_GATE_ENABLED` (default false) to `.env.example`; the settings service seeds `publishGate.maxPendingOpportunities` (default 3).

## Capabilities

### New Capabilities
- `opportunities`: the opportunity/task entity with embedded positions, the §5 lifecycle machine, public feed + details, org internals + publish/activate routes, and the `startDate` job ticker.

### Modified Capabilities
- `extension-seams`: document that the publish route now consumes the `PublishGateService` seam (inert default unlocked; S13 swaps in the real counter), and that the opportunities module registers the `opportunity` whitelist in `StatusTransitionRegistry`.

## Impact

- New module tree in `/backend/src/opportunities`; base schema helper, guards, error envelope, `StatusTransitionService`, `JobRegistry` and seams reused from S1/S2/S5.
- New collection: `opportunities` (inventory §3). New routes: the public feed/detail/recommended trio plus the org internals and the five action routes under `api/v1`. New job handler registered in the S1 registry.
- One new env var (`PUBLISH_GATE_ENABLED`) and one seeded `system_settings` key (`publishGate.maxPendingOpportunities`); `.env.example` updated.
- `GET /organizations/:slug/opportunities` from S5 begins returning real published opportunities instead of an empty list.
- Out of scope (§4 S6): applications (S7), recommended-engine rules (S12), gate math (S13), the `in_progress` notification (S13), admin force-close (S16).