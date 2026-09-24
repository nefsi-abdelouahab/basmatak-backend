## Context

S1’s cursor lists each duplicate the same `limit + 1` pattern and return no result total or page metadata. Session 7 adds a single counted-page path and additive query capabilities across the list services named in the roadmap. It must retain Mongoose, cursor navigation, existing access/visibility rules, and global DTO validation; it must not touch the concurrent admin analytics work or any archived change.

## Goals / Non-Goals

**Goals:**

- Return consistent `total`, `page`, and `pages` metadata for S7-owned cursor lists.
- Centralize count-and-page mechanics while keeping endpoint query construction and authorization in their owning services.
- Add only the filters, sort validation, talent facets, and submission title specified by Session 7.
- Test count math, filter semantics, and the roadmap acceptance paths.

**Non-Goals:**

- Offset/window pagination redesign, new routes, exports, admin list totals, analytics, name/label embeds, or `position.applicationCount`.
- New packages, data migrations, background jobs, or changes to status transitions and ownership rules.

## Decisions

### 1. Shared counted cursor-page executor

`common/pagination` will own an `execPage(model, query, opts)`-style helper. Callers provide the authorized base filter and deterministic sort; the helper counts that base filter, applies only the cursor constraint to fetch `limit + 1` rows, and returns the shared metadata. This removes the current per-service copies without moving module-specific query logic into common code. A transaction is not used: a count and page read can observe a concurrent write, which is acceptable for additive list metadata.

### 2. Cursor navigation remains opaque and deterministic

The cursor contract remains cursor-based. Each validated sort maps to a deterministic server-owned order with a stable `_id` tie-break; the opaque cursor carries whatever ordering state is necessary for that order. The default retains the existing newest-first behavior, so clients not using new query parameters remain compatible. This avoids offset scans and prevents duplicate/gapped rows when a non-default sort has ties.

### 3. Endpoint DTOs own query vocabulary

Each affected DTO declares only that endpoint’s additive inputs. A small common comma-splitting `toArray` transform handles the roadmap’s multi-value encoding; endpoint services apply their documented filter semantics and count against the same base filter. Sort whitelists remain endpoint-local rather than a shared free-form field/order API, so unlisted fields cannot reach Mongo queries.

### 4. Talent facets share the filtered population

The talents service first establishes its public-profile filter, then derives the count and skill/wilaya facet counts from that same population in one aggregation. Card presentation remains in the existing batched mapper, retaining the no-N+1 and privacy behavior. Experience-count filtering uses the already-indexed experience lookup named by the roadmap.

### 5. Title is optional and additive

`submissions.title` is optional. The create and draft-update DTOs accept it; stored legacy submissions remain valid without it. It does not alter submission status, consent, evidence, or verification flows.

### 6. Shared page contract covers existing S7 cursor callers

Participation and notification list implementations migrate to the common counted executor because their `CursorPage` type becomes required. No filters or response embeds are added to those modules. Admin list totals remain entirely with Session 8.

## Risks / Trade-offs

- **[Risk] Count and rows can differ during concurrent writes** → Calculate both from the same base filter and retain cursor behavior; no false transactional guarantee is made.
- **[Risk] Count/facet queries add read cost** → Reuse existing indexed filters, retain limit caps, and test the talents aggregation as one bounded operation.
- **[Risk] Arbitrary sort fields could bypass indexes or destabilize cursors** → DTO whitelist plus server-owned deterministic sort mappings only.
- **[Risk] Session 8 modifies nearby planning files concurrently** → This change writes only its own OpenSpec directory and does not modify admin contracts or code.

## Migration Plan

1. Deploy the additive response metadata and query DTOs with legacy cursor defaults intact.
2. Deploy optional `submissions.title`; existing documents require no backfill.
3. Roll back by removing new query use at clients; legacy cursor readers ignore additive response fields. No data rollback is required for optional titles.

## Open Questions (resolved with owner, 2026-09-24)

- Sort whitelists — APPROVED as recommended sets: feed `newest, oldest, deadline_asc, startDate_asc`; talents `newest, oldest, experiences_desc` (backed by `stats.verifiedExperiences`); org inbox/application/experience/submission/org lists `newest, oldest`. Unknown values rejected by DTO validation (400). Implemented.
- Submissions `format` vocabulary — APPROVED as evidence-kind vocab `image, video, document, link` matched against evidence media kind/type (`image`: file+image mime; `video`: link or video mime; `document`: file+application mime; `link`: type link, bounded to 1000 media rows). Implemented.
- Public organization search `page` — APPROVED as response metadata only: pagination stays cursor-based (`cursor`+`limit` in; `total`/`page`/`pages` out); an optional `?page=` input is accepted but ignored so legacy callers do not 400. Implemented.
