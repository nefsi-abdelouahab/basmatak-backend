## Why

The merged public volunteer profile's work-samples grid renders portfolio items with only `title`/`description`/media, but the design's cards draw item-type labels (Photography, Audio, Field Research…) and per-item skill tags. The backend `portfolio_items` rows carry none of it, so the grid cannot reproduce the design's richer cards. This session adds the two metadata fields — pure extension, routes unchanged (RP Part 7 volunteers (portfolio) row; RP §1.5/§5.6 merged-profile portfolio grid).

## What Changes

- `portfolio_items` gains **optional** `typeLabel` (short text, trimmed, ≤ 40 chars) and `tags` (array of trimmed strings, ≤ 10 tags, each ≤ 30 chars, deduped). Both default-absent; existing rows are unaffected and never rewritten.
- `POST /portfolio/me` (`CreatePortfolioItemDto`) and `PATCH /portfolio/:itemId` (`UpdatePortfolioItemDto`) accept both as optional, validated fields; `forbidNonWhitelisted` stays — unknown keys are still rejected.
- `GET /portfolio/me` own-item view and public `GET /volunteers/:username/portfolio` payload (via `PortfolioQueryService`) include `typeLabel`/`tags` when present; absent metadata degrades gracefully (`typeLabel: null`, `tags: []` on the own view; `typeLabel` omitted and `tags: []` on the public shape — additive-optional, seam stays source-compatible).
- Existing reorder, visibility, and media-linkage rules are untouched; no new collection, route, package, or env var.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities

- `portfolio`: the `portfolio_items` document shape SHALL carry optional `typeLabel`/`tags`; the create/update DTO surfaces accept them; the own-list view and the public read include them with graceful absence handling.

## Impact

- `backend/src/portfolio/schemas/portfolio-item.schema.ts` — optional `typeLabel` (trim, maxlength 40), `tags` (String[], trim, maxlength 30) on the interface + schema; no new index (no filter path in scope).
- `backend/src/portfolio/dto/portfolio.dto.ts` — `CreatePortfolioItemDto` / `UpdatePortfolioItemDto` gain optional `typeLabel`/`tags` with class-validator bounds.
- `backend/src/portfolio/portfolio.service.ts` — write on create, `$set` on update (only when defined), hydrate into `PortfolioItemView`.
- `backend/src/common/seams/portfolio-query.service.ts` — `PortfolioItemShape` + `getPublicPortfolio` mapping.
- Tests: unit bounds/hydration in `portfolio.service.spec.ts` (and/or a small DTO spec) + `portfolio-query.service.spec.ts`; E2E in `portfolio.e2e-spec.ts`.