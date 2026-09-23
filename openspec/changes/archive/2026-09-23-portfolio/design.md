## Context

Volunteers today have verified experiences (S11) but no curated, self-authored showcase. The inventory §2.15 defines five portfolio routes and §3 a `portfolio_items` collection with a `(volunteerId, order)` index; `media` already carries a `portfolioItemId` reference and `MediaPurpose` includes `portfolio_item` (F6). Roadmap F9 deferred the public read: the S1 `PortfolioQueryService` seam in `backend/src/common/seams/portfolio-query.service.ts` still returns `{ items: [] }`, and the S12 `public-discovery` change is scaffold-only in this tree — no consumer of the seam exists yet, so this session also wires the public route the user selected.

Established conventions carried in (from S1/S6/S8/S11): NestJS 10 + TS strict, `/api/v1` prefix, `{ statusCode, code, message, details? }` errors with UPPER_SNAKE codes, class-validator whitelist + forbidNonWhitelisted, `volunteerId` == `account.sub` (the user `_id`, per participations/submissions), foreign-ownership reads → `404` (§6), seam swaps via Nest DI without touching the depending module, and the replica-set `mongodb-memory-server` test rig (S1) which makes Mongo sessions free.

The current seam binding: `CommonModule` (global) provides `PortfolioQueryService` directly and exports it; no `portfolio_items` model is registered anywhere yet, and the `PortfolioQueryService` interface shape is `{ id, mediaId? }` — minimal because it was inert.

## Goals / Non-Goals

**Goals:**
- A `backend/src/portfolio/` module owning `portfolio_items`: schema + `(volunteerId, order)` index, a service, a controller and DTOs exposing the five §2.15 routes.
- Create/update/delete flows that validate every media through `MediaOwnership.assertFor(mediaId, volunteerId, 'portfolio_item')` and maintain the `media.portfolioItemId` linkage (set on link, cleared on unlink/delete; a row already linked to another item rejected with `409`).
- `PUT /portfolio/me/order` as an atomic batch reorder inside a Mongo transaction: re-read the volunteer's items, validate the submitted ids exactly match the current own-item set, rewrite sequential `order`s — concurrent calls converge to exactly one submitted permutation.
- The real `PortfolioQueryService`: `getPublicPortfolio(username)` → `404` for unknown/disabled profiles (A5), otherwise `visibility=public` items ordered by `order` with media metadata restricted to public media rows.
- Public guest route `GET /volunteers/:username/portfolio` consuming the seam (registered in the volunteers controller; does not gate on `showPortfolio` per §2.6).

**Non-Goals:**
- Verified-experience duplication (experiences come from S11 and are separate), sharing links, featured/private toggling beyond `visibility`, the full S12 public profile page/talents/experiences routes, pagination on `GET /portfolio/me` (a curated handful of rows, ordered by `order`).
- Changing the three canonical transactions (accept, verify, withdraw) or any other module's behavior beyond the additive seam upgrade.
- Any new package or env var.

## Decisions

**D1 — Module layout.** New `backend/src/portfolio/` following the S11 shape:
- `schemas/portfolio-item.schema.ts` — `PortfolioItemsCollection = 'portfolio_items'`; fields `volunteerId` (ObjectId ref `users`, required), `title` (trim, required, max 120), `description` (trim, optional, max 2000), `mediaIds` (ObjectId[], default `[]`), `visibility` (`public | private`, default `public`), `order` (Number, required); `createSchema` base options; index `(volunteerId, order)`.
- `portfolio.service.ts` — `listMine`, `create`, `update`, `delete`, `reorder`; the only file that calls `MediaOwnership`, `@InjectConnection().startSession()` and the transaction helpers.
- `portfolio.controller.ts` + `dto/portfolio.dto.ts` — the five routes with `@Roles('volunteer')`; `me` and `me/order` declared before `:itemId` so no shadowing.
- `portfolio.module.ts` — `MongooseModule.forFeature([{ name: PortfolioItemsCollection, schema: PortfolioItemSchema }])`, imports `VolunteersModule` + `MediaModule` (read-only foreign models, notifications precedent), providers `PortfolioService`, controller `PortfolioController`. Registered additively in `app.module.ts`.

**D2 — Seam upgrade in place (provider-body swap, source-compatible).** The `PortfolioQueryService` class in `common/seams/portfolio-query.service.ts` becomes the real read (same class name, same exports — CommonModule keeps binding and exporting it untouched, so "the swap" is purely the implementation, exactly like the S8 `MediaOwnership` seam upgrade). `Mock` the injection: it needs `VolunteerProfilesCollection` (from the VolunteersModule MongooseModule that CommonModule already imports), `MediaCollection` (already registered in CommonModule), and `PortfolioItemsCollection`. To keep collection ownership with the portfolio module while letting the seam inject the model, add `PortfolioItemsCollection` to CommonModule's `MongooseModule.forFeature` (precedent: `media` is registered in both CommonModule and MediaModule). `PortfolioItemShape` extends additively to `{ id, title?, description?, media?: { mediaId, ...metadata }[] }` — new fields optional, existing consumers stay source-compatible; the real responses include them.

**D3 — Create.** `POST /portfolio/me` `{ title, description?, mediaIds?, visibility? }`: owner `volunteerId = account.sub`; `order = (max order for volunteerId) + 1` (0 when empty — computed inside the transaction on the leader). Dedupe `mediaIds` and validate each via `MediaOwnership.assertFor(mediaId, account.sub, 'portfolio_item')`; reject an id whose row already has `portfolioItemId` set to a different item with `409 MEDIA_ALREADY_LINKED`. The insert, plus setting `media.portfolioItemId = item._id` on every linked row, runs inside a Mongo session so the item and its linkage commit or roll back together (deviation D7).

**D4 — PATCH / DELETE.** `PATCH /portfolio/:itemId` updates `title`/`description`/`mediaIds`/`visibility`: owner check first (foreign → `404 PORTFOLIO_ITEM_NOT_FOUND`); within a session, validate the new media set, then reconcile the linkage (clear `portfolioItemId` on removed rows, set it on added rows) and write the item. `DELETE /portfolio/:itemId`: owner check (404), within a session clear `portfolioItemId` on every linked media row and delete the item — the delete is a hard row removal (portfolio items are user-curated content with no audit need; `AuditInterceptor` already handles the sensitive PATCH/DELETE cases). Both non-owner reads treat the item as not-found per §6.

**D5 — Atomic reorder.** `PUT /portfolio/me/order` `{ itemIds: string[] }`. Inside `session.withTransaction` (with bounded `TransientTransactionError` retry): re-read the caller's items (all rows for `volunteerId = account.sub`), assert the `itemIds` set exactly equals the current own-item `_id` set (any foreign/missing/absent id → `409 PORTFOLIO_REORDER_CONFLICT`, nothing written), then set `order = index` per the submitted sequence and write each row. Because the transaction re-reads current state and only commits whole, concurrent reorders serialize on the overlapping documents: the loser's retry re-reads the winner's committed `order`s and re-applies its own permutation over them, converging to exactly one of the two submitted sequences — never an interleave. This is the property the unit test asserts.

**D6 — Public route + read.** In `volunteers.controller.ts`, add `@Get(':username/portfolio')` with `@Public()` calling `PortfolioQueryService.getPublicPortfolio(username)` (no `showPortfolio` gate — §2.6 lists the dedicated endpoint independently of the profile-page flag; `publicProfile.enabled=false` or unknown profile → `404 VOLUNTEER_NOT_FOUND` thrown by the seam, matching A5 and the S12 module's 404 contract). The seam resolves `volunteer_profiles` by `username`, then queries `portfolio_items { volunteerId: profile.userId, visibility: 'public' }` sorted by `order`, resolving each item's `mediaIds` to metadata filtered to non-deleted `visibility=public` rows (private media never leaks).

**D7 — Deviation: additional transactions.** The roadmap documents three canonical transactions (accept, verify, withdraw) and the media-linkage + reorder flows here are inherently multi-document (`portfolio_items` ↔ `media`). This session adds four short-lived sessions (create, update, delete, reorder) in the same pattern. The three canonical transactions are untouched; the new ones are isolated to the portfolio module. Recorded as a deviation to report.

**D8 — Ordering after delete.** Deleting an item leaves `order` gaps; `GET /portfolio/me` and the public read sort by `order` so ordering stays stable without renumbering. Renumbering is intentionally not auto-triggered on delete — the next explicit `PUT /portfolio/me/order` normalizes.

## Risks / Trade-offs

- **Session multi-document writes are new.** The portfolio flows join `portfolio_items` and `media`; a crash between the item write and the media-link update used to be the naive failure mode. → Every mutation runs inside a Mongo session on the proven replica-set rig; rollback tests assert no orphan linkage.
- **Reorder convergence depends on transaction retry.** `withTransaction` retries on `TransientTransactionError` automatically; without the retry a concurrent reorder surface-level-aborts. → The unit test forces two concurrent reorders and asserts the final rows equal exactly one submitted permutation; a bounded manual retry loop wraps `withTransaction` for belt-and-braces (pattern verified in S7/S11).
- **Media reuse across items is rejected.** A media row's `portfolioItemId` is a single reference (schema), so one row can belong to one item only. → `409 MEDIA_ALREADY_LINKED` on link; the error is a cheap, explicit signal rather than silent linkage corruption.
- **Seam shape grows.** `PortfolioItemShape` adds optional fields. → New fields are optional and additive; no current consumer (S12 is scaffold-only) breaks, and the E2E asserts the public payload shape.
- **Public `:username` route could collide with future S12 routes.** Adding `volunteers/:username/portfolio` while S12 isn't present is safe (no `/volunteers/:username` route exists yet). → The route is additive and does not change existing `/volunteers/me` paths; S12's later profile-page work will reuse the same seam.

## Migration Plan

- New `portfolio_items` collection only; the `(volunteerId, order)` index builds on first boot (`autoIndex`, same as every prior session — test rig + local dev; Atlas warm-up at deploy). `media.portfolioItemId` field/index already exist (S8); this session merely writes/clears it.
- `app.module.ts` gets one additive import (`PortfolioModule`); CommonModule adds `PortfolioItemsCollection` to its existing `forFeature` and the seam file body swaps (no export/consumer changes).
- Rollback: revert the commit; the seam returns to its S1 inert body, the new routes cease to exist, and no other module references `portfolio_items`. `media.deletedAt` behavior on portfolio-linked rows is gated by `portfolioItemId` being set — see the media delta.

## Open Questions

- None blocking. The `showPortfolio`-independent dedicated endpoint (§2.6) vs the profile-page gate (S12) is covered by D6; whether S12 later wants the profile page's portfolio section to reuse this exact seam is confirmed by the extension-seams delta. Portal `order` gap handling (D8) is a deliberate, documented choice.