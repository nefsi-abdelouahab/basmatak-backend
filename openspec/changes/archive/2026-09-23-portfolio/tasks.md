## 1. Schema and infra

- [ ] 1.1 Add `backend/src/portfolio/schemas/portfolio-item.schema.ts`: `PortfolioItemsCollection = 'portfolio_items'` with `volunteerId` (ObjectId, ref users, required), `title` (trim, required, maxlength 120), `description` (trim, optional, maxlength 2000), `mediaIds` (ObjectId[], default `[]`), `visibility` (`public | private`, default `public`), `order` (Number, required); `createSchema`; compound index `(volunteerId, order)`. Register the schema via `MongooseModule.forFeature` in BOTH the new `PortfolioModule` and `CommonModule` (seam needs the model; media precedent).
- [ ] 1.2 Add `PortfolioModule` to `backend/src/app.module.ts` imports.

## 2. DTOs and controller

- [ ] 2.1 Add `backend/src/portfolio/dto/portfolio.dto.ts` with `CreatePortfolioItemDto` (`title` string required, `description` string optional, `mediaIds` string[] optional, `visibility` enum public|private optional default public), `UpdatePortfolioItemDto` (same fields all optional with noPartial flag), and `ReorderPortfolioDto` (`itemIds` string[] required); class-validator whitelist + forbidNonWhitelisted + transform like sibling DTOs.
- [ ] 2.2 Add `backend/src/portfolio/portfolio.controller.ts` with `@Controller('portfolio')`, routes: `GET /me`, `POST /me`, `PATCH /:itemId`, `DELETE /:itemId`, `PUT /me/order` — all `@Roles('volunteer')` and `@CurrentAccount()`; `me` and `me/order` declared before `:itemId`.
- [ ] 2.3 Add `@Get(':username/portfolio')` `@Public()` to `backend/src/volunteers/volunteers.controller.ts` calling `PortfolioQueryService.getPublicPortfolio(username)`, mapping the seam's throw to the existing error envelope.

## 3. Portfolio service (real mutations)

- [ ] 3.1 Add `backend/src/portfolio/portfolio.service.ts` implementing `listMine` (own rows sorted by `order` ascending, hydrated media metadata) and `create` (owner `volunteerId = account.sub`; order = max+1 inside the session; dedupe `mediaIds`; validate each via `MediaOwnership.assertFor(mediaId, account.sub, 'portfolio_item')`; reject already-linked row with `409 MEDIA_ALREADY_LINKED`; insert item + set `portfolioItemId` on every linked media row inside a Mongo session with proper rollback).
- [ ] 3.2 Implement `update` (owner check first → foreign id `404 PORTFOLIO_ITEM_NOT_FOUND`; in-session reconcile of media linkage: clear `portfolioItemId` on removed rows, set on added rows, reject already-linked rows 409; write item fields) and `delete` (owner check → foreign 404; in-session clear `portfolioItemId` on linked rows then remove the item).
- [ ] 3.3 Implement `reorder` (`PUT /portfolio/me/order`): inside `session.withTransaction` with bounded `TransientTransactionError` retry, re-read own rows, assert `itemIds` set equals current own-item id set (else `409 PORTFOLIO_REORDER_CONFLICT`, nothing written), write `order = index` per submitted sequence.

## 4. Real PortfolioQueryService seam

- [ ] 4.1 Replace `backend/src/common/seams/portfolio-query.service.ts` body with the real read (same class + export): resolve `volunteer_profiles` by username; unknown profile or `publicProfile.enabled=false` → throw `404 VOLUNTEER_NOT_FOUND` (existing envelope); else query `portfolio_items { volunteerId: profile.userId, visibility: 'public' }` sorted by `order`; append media metadata filtered to non-deleted `visibility=public` rows; extend `PortfolioItemShape` additively (`title`, `description`, `media` optional).
- [ ] 4.2 Confirm `CommonModule` provides/exports `PortfolioQueryService` unchanged after the swap (Interface + DI source-compatible, no consumer edits).

## 5. Tests

- [ ] 5.1 Unit specs for `PortfolioService`: order assignment (max+1, 0 when empty), media linkage set/clear on create/update/delete, foreign-item ops → 404, already-linked media → 409, reorder set-mismatch → 409, and reorder atomicity — two concurrent reorders on the same rows converge to exactly one submitted permutation (transaction retry re-reads the winner's orders).
- [ ] 5.2 Unit spec for `PortfolioQueryService`: visibility filter (private items/private media excluded, public ordered by `order`), unknown/disabled profile → 404.
- [ ] 5.3 E2E `backend/test/portfolio.e2e-spec.ts`: register + login volunteer (helper from existing suites); upload + confirm `portfolio_item`-purpose media via the media flow; create/list/patch/delete an item; reorder persists across a fresh read; public guest `GET /api/v1/volunteers/:username/portfolio` returns real items; private items hidden from guests; patch/delete on another volunteer's item → 404.

## 6. Review

- [ ] 6.1 Run `npm run build` and `npm run lint` in `backend/`.
- [ ] 6.2 Run `npm test` and `npm run test:e2e` in `backend/` (portfolio suites green, no regressions).
- [ ] 6.3 Run `openspec validate portfolio` and `openspec status --change portfolio` in the repo root.