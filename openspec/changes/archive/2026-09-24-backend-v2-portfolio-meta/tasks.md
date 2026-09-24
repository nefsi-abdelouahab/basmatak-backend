## 1. Schema and DTOs

- [ ] 1.1 Add optional `typeLabel` (trim, maxlength 40) and `tags` (String[], default `[]`, per-element trim + maxlength 30) to the `PortfolioItem` interface and `PortfolioItemSchema` in `backend/src/portfolio/schemas/portfolio-item.schema.ts`; no new index.
- [ ] 1.2 Extend `CreatePortfolioItemDto` and `UpdatePortfolioItemDto` in `backend/src/portfolio/dto/portfolio.dto.ts` with optional `typeLabel` (`IsString`, `MaxLength(40)`) and `tags` (`IsArray`, `ArrayMaxSize(10)`, `IsString({ each: true })`, `MaxLength(30, { each: true })`, `ArrayUnique`) plus trim transform; `forbidNonWhitelisted` unchanged.

## 2. Service writes and own-view hydration

- [ ] 2.1 `create` (`backend/src/portfolio/portfolio.service.ts`): write `typeLabel`/`tags` into the inserted doc only when supplied; absent stays absent.
- [ ] 2.2 `update`: add `typeLabel`/`tags` to the `$set` map only when the body defines them; a partial PATCH never blanks metadata.
- [ ] 2.3 `PortfolioItemView` gains `typeLabel: string | null` and `tags: string[]`; `hydrateMedia` maps `row.typeLabel ?? null` and `row.tags ?? []` so `GET /portfolio/me` returns them.

## 3. Public projection

- [ ] 3.1 `PortfolioItemShape` in `backend/src/common/seams/portfolio-query.service.ts` gains optional `typeLabel?: string` / `tags?: string[]` (additive, source-compatible).
- [ ] 3.2 `getPublicPortfolio` maps them: `typeLabel` included only when the item has one; `tags` always included (`[]` fallback).

## 4. Tests

- [ ] 4.1 Unit — DTO validation bounds using `validate(plainToInstance(...))` where the codebase does it: `typeLabel` > 40 → error, `tags` > 10 → error, any tag > 30 → error, unknown key flagged; valid metadata passes.
- [ ] 4.2 Unit — `PortfolioService`: create/update persist metadata, own view returns `typeLabel`/`tags`, absent → `typeLabel: null` / `tags: []`, partial PATCH leaves unsubmitted metadata untouched.
- [ ] 4.3 Unit — `PortfolioQueryService`: public shape includes `typeLabel`/`tags` when present and omits `typeLabel` (still `tags: []`) when absent; visibility filtering unchanged.
- [ ] 4.4 E2E — `backend/test/portfolio.e2e-spec.ts`: create + patch with metadata → present on `GET /volunteers/:username/portfolio` and on own `GET /portfolio/me`; without metadata → `typeLabel` omitted (`tags: []`) on public, null-owned on own; guests still see only `visibility=public`; DTO rejects an unknown key with `400`.

## 5. Review

- [ ] 5.1 Run `npm run build` and `npm run lint` in `backend/`.
- [ ] 5.2 Run `npm test` and `npm run test:e2e` in `backend/` (portfolio suites green, no regressions).
- [ ] 5.3 Run `openspec validate backend-v2-portfolio-meta` and `openspec status --change backend-v2-portfolio-meta` in the repo root.
- [ ] 5.4 `openspec archive backend-v2-portfolio-meta -y` and commit `feat(backend-v2-portfolio-meta): type label and tags on portfolio items` (local only, never push).