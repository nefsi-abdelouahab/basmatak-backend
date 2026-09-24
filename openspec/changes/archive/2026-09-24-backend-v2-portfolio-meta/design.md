## Context

The v1 portfolio module (`backend/src/portfolio/`) owns `portfolio_items` with `{ volunteerId, title, description?, mediaIds, visibility, order }`, five owner routes, and a real public read via the `PortfolioQueryService` seam in `common/seams/portfolio-query.service.ts` serving `GET /volunteers/:username/portfolio` (S14 swap already landed). The merged public profile's work-samples grid (RP Part 7 volunteers (portfolio) row; RP §1.5/§5.6) renders richer cards — item-type labels and per-item tags — that no backend field backs. This session adds two **optional, additive** metadata fields (`typeLabel`, `tags[]`); routes, visibility/reorder rules, and media linkage all stay untouched. No new collection, package, env var, or index.

Conventions carried in: NEXT API `/api/v1`, class-validator `whitelist` + `forbidNonWhitelisted` + transform, `{ statusCode, code, message, details? }` errors, `PortfolioItemView` own-view hydration and `PortfolioItemShape` public shape both stringify ids and resolve media metadata. The seam upgrade pattern (source-compatible, additive-optional fields) matches the S14 swap.

## Goals / Non-Goals

**Goals:**
- `portfolio_items` accepts optional `typeLabel` (≤ 40) and `tags` (≤ 10 entries, each ≤ 30, deduped) on create and patch, persisted and returned.
- Both the own list (`GET /portfolio/me`) and the public read (`GET /volunteers/:username/portfolio`) surface the metadata; absent metadata degrades gracefully.
- Existing behavior (visibility gating, ordering, media ownership/linkage, unknown-key rejection) unchanged.

**Non-Goals:**
- Media changes, link-item handling, the deleted standalone "My Portfolio" screen, a featured flag, counts/date charts (derived client-side from timestamps per FCD/decision notes), single-item GET, experience-to-item linking, any new query/filter/sort path on the metadata.

## Decisions

**D1 — Schema surfaces, additive only.** `PortfolioItem` interface + `PortfolioItemSchema` gain `typeLabel?: string` (trim, `maxlength: 40`) and `tags: string[]` (`default: []`, each element trimmed, `maxlength: 30`). Mongoose array-size bound is enforced at DTO/service level (`ArrayMaxSize(10)` + dedupe), matching where the other array bounds live in this codebase; the schema still trims and caps per-element length so raw model writes cannot store junk. No new index — the roadmap declares no filter/sort path in this session, and adding one would be premature.

**D2 — DTO bounds with forbidNonWhitelisted intact.** `CreatePortfolioItemDto` and `UpdatePortfolioItemDto` gain:
- `typeLabel?` — `@IsOptional() @IsString() @MaxLength(40)`
- `tags?` — `@IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(30, { each: true }) @ArrayUnique()`
The global `forbidNonWhitelisted` (already on the module's `ValidationPipe`) keeps rejecting unknown keys — the added properties are simply new allowed keys. `@Transform` trims each tag (and `typeLabel`) so stored values are canonical.

**D3 — Service writes only when supplied.** `create` copies `typeLabel`/`tags` into the inserted doc only when provided (absent stays absent; `tags` effectively `[]` via schema default). `update` adds `typeLabel?`/`tags?` to the `$set` map only when defined — mirroring the existing `title`/`description` handling — so a partial PATCH never blank-fields metadata. `PortfolioItemView` gains `typeLabel: string | null` and `tags: string[]`; `hydrateMedia` maps `row.typeLabel ?? null` and `row.tags ?? []`.

**D4 — Seam extension stays source-compatible.** `PortfolioItemShape` in `common/seams/portfolio-query.service.ts` gains `typeLabel?: string` and `tags?: string[]` — additive optional, so `VolunteersService` and S12 consumers compile unchanged. `getPublicPortfolio` sets `typeLabel` only when the item has one and always sets `tags` (`[]` fallback), so the public grid renders cards uniformly while absent labels are simply omitted.

**D5 — Absence semantics (own vs public).** Own view: `typeLabel: null`, `tags: []` when absent (the view is a full projection; nullable field keeps the contract explicit). Public shape: `typeLabel` omitted, `tags: []` when absent (additive-optional per D4; the E2E asserts both `present` and `omitted`). Both degrade without error.

## Risks / Trade-offs

- **Metadata becomes free-text.** `typeLabel` is a client-chosen short label, not an enum — deliberate (the design's label set is editorial and already outlived the removed standalone screen). → Bounded length (40) keeps it a chip, not prose; tags are capped/deduped server-side.
- **No index on metadata.** A later session wanting filter/facet on `tags` will add one. → Explicit out-of-scope here; the roadmap scopes this session to "expose on the merged grid". Flag in open questions only if a consumer emerges.
- **Array-size at DTO not schema.** A raw model write could bypass `ArrayMaxSize`. → Same pattern as `mediaIds`/`itemIds` in this module (bounds enforced at the API surface); schema still trims and length-caps elements.
- **Seam shape grows again.** Same as the S14 swap — new fields are optional. → D4 keeps existing consumers source-compatible; no consumer edits needed.

## Migration Plan

- Additive schema fields only: existing `portfolio_items` rows are untouched (no backfill — absence is valid), the `(volunteerId, order)` index is unchanged, and no collection/index build is required beyond the normal autoIndex on boot (test rig + local dev; Atlas warm-up at deploy). The DTOs, service hydration, and seam mapping change in place.
- Rollback: revert the commit — the new fields vanish from schema/DTOs/views, and existing routes/payloads return to their v1 shape; nothing else references them.

## Open Questions

- None blocking. Whether the merged profile later wants filter/facet on `tags` is deliberately deferred (would need a dedicated index + query session, out of scope here).