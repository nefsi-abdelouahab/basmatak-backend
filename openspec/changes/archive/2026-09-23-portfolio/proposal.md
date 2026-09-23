## Why

Volunteers have verified experiences (S11) but no curated, self-authored showcase beyond them. The inventory (§2.15, §3) defines a `portfolio_items` collection and five routes, and roadmap F9 defers the real public portfolio read to this session: the S1 `PortfolioQueryService` seam still returns `{ items: [] }`, so `GET /volunteers/:username/portfolio` cannot show anything real.

## What Changes

- Add a `portfolio_items` collection (owner: portfolio module) with the inventory's `(volunteerId, order)` index. Fields: `volunteerId`, `title`, `description?`, `mediaIds` (`ObjectId[]`), `visibility` (`public | private`, default `public`), `order`, S1 base options.
- Add the five §2.15 routes: `GET /portfolio/me` (own items ordered by `order`), `POST /portfolio/me` (`{ title, description?, mediaIds?, visibility? }`, appends at `order = max+1`), `PATCH /portfolio/:itemId` (owner-only, editable fields incl. media/visibility), `DELETE /portfolio/:itemId` (owner-only, unlinks media), `PUT /portfolio/me/order` (atomic batch reorder — a Mongo transaction re-reading and rewriting the volunteer's item `order`s so concurrent reorders converge to exactly one submitted permutation).
- Media linkage: every `mediaId` on create/patch is validated through `MediaOwnership.assertFor(mediaId, volunteerId, 'portfolio_item')` and the referenced media rows get `media.portfolioItemId` set to the item (cleared when unlinked/deleted), which also engages the existing delete-protection path. A media row already linked to a different portfolio item is rejected (`409`).
- Replace the `PortfolioQueryService` inert default with the real query: given a username, resolve the profile (unknown or `publicProfile.enabled=false` → `404` per A5) and return the volunteer's `visibility=public` items ordered by `order`, each with media metadata restricted to `visibility=public` rows. The class name/interface stay source-compatible; the provider bodies swap only (`extension-seams` contract).
- Add the public guest route `GET /volunteers/:username/portfolio` wired to the real seam (S12's `public-discovery` change is not implemented in this tree, so this session registers the dedicated route; `publicProfile.enabled=false` → `404`, `showPortfolio` does NOT gate the dedicated endpoint per §2.6).

## Capabilities

### New Capabilities
- `portfolio`: `portfolio_items` collection + indexes, the five §2.15 routes with the create/patch media-ownership and linkage rules, the atomic batch reorder, and the real public portfolio read + `GET /volunteers/:username/portfolio`.

### Modified Capabilities
- `extension-seams`: the `PortfolioQueryService` requirement changes from "inert empty default until S14" to the real public query (visibility filter + A5 `404`), swapped via the provider binding without consumer changes.
- `media`: the delete-protection requirement is extended so media referenced by a portfolio item (`portfolioItemId` set) is also blocked from deletion (`409`), matching the existing `deletion-policy` behavior now that this session actually sets the linkage.

## Impact

- Backend: new `backend/src/portfolio/` module (schema, service, controller, DTOs); real `PortfolioQueryService` implementation registered in place of the S1 inert default (interface untouched); additive wiring in `backend/src/app.module.ts`; `GET /volunteers/:username/portfolio` in the volunteers controller namespace.
- New E2E `backend/test/portfolio.e2e-spec.ts`; unit tests for reorder transactionality/atomicity, the visibility filter, media linkage, and foreign-item `404`s.
- `openspec/specs/portfolio` (new), plus MODIFIED deltas for `openspec/specs/extension-seams` and `openspec/specs/media`. No new packages or env vars.