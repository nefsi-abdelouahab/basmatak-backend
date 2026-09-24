## 1. Required Contract Clarifications

- [x] 1.1 Confirm the allowed `sort` tokens and their field/direction mapping for each affected endpoint, then record only those approved values in the change artifacts.
- [x] 1.2 Confirm the accepted submissions `format` vocabulary and its authoritative media attribute, then record only that approved contract in the change artifacts.
- [x] 1.3 Confirm whether public organization search’s roadmap `page` is a request input or the additive `CursorPage.page` response field, reconciling it with the no-window-pagination boundary before implementation.

## 2. Shared Counted Cursor Pagination

- [x] 2.1 Make `CursorPage.total`, `CursorPage.page`, and `CursorPage.pages` required and implement the common counted-page executor with default/max limit behavior and deterministic opaque cursor handling.
- [x] 2.2 Migrate S7-owned cursor-list implementations to the common executor: public/own/recommended opportunities, talents and public experiences, applications, submissions, own experiences, participations, and notifications; preserve each route’s existing ownership, visibility, and default order.
- [x] 2.3 Preserve counted metadata when a service transforms page items after retrieval, including application inbox joiner rows and participant roster rows.
- [x] 2.4 Do not implement admin-list totals, CSV, analytics, embeds, or `position.applicationCount`.

## 3. List Query Contracts

- [x] 3.1 Add the shared comma-separated multi-value parsing utility and endpoint DTO validation, including approved closed sort whitelists with `forbidNonWhitelisted` behavior preserved.
- [x] 3.2 Extend `GET /opportunities` with the approved sort/multi-select inputs, volunteer `nearMe=me`, and day-of-week-aware `from`/`to` windows; keep published-only visibility and cursor behavior.
- [x] 3.3 Extend `GET /organizations/me/opportunities` with title/location/skill `q` and approved sorting while retaining organization ownership and its existing status filter.
- [x] 3.4 Extend `GET /talents` with `minExperiences`, `hasAvailability`, `portfolio`, comma-separated `skillIds`/`wilayaIds`, approved sort, and one filtered-population aggregation for skill/wilaya facets; retain public projection and batched card mapping.
- [x] 3.5 Extend `GET /applications/me` with `from`/`to` and `GET /organizations/me/applications` with approved sorting, without altering the S17 `ApplicationInboxJoiner` seam or adding response embeds.
- [x] 3.6 Extend `GET /experiences/me` with `categoryId`, `skillId`, `from`, and `to` while retaining own-row isolation and existing registry-id output.
- [x] 3.7 Extend `GET /organizations` with the approved public `q`/page contract while retaining verified-and-active visibility.
- [x] 3.8 Extend `GET /organizations/me/submissions` with comma-separated multi-status, `q`, approved `format`, and approved sort, retaining organization isolation and no response joins.

## 4. Submission Title

- [x] 4.1 Add optional `submissions.title` to the schema and create/draft-update DTO and service paths; preserve draft/rejected edit rules and all submission transitions.

## 5. Automated Coverage

- [x] 5.1 Add unit coverage for total/page/pages math (including a non-even final page), shared multi-value parsing, and rejection of unapproved sort tokens.
- [x] 5.2 Add unit coverage for the talents filtered count/facet aggregation and `minExperiences` lookup without introducing N+1 queries.
- [x] 5.3 Add E2E coverage for exact list totals/page metadata, multi-select semantics, and volunteer `nearMe=me` wilaya resolution.
- [x] 5.4 Add E2E coverage that talent facets remain consistent with the filtered total and that `submissions.title` persists through create and draft update.
- [x] 5.5 Add E2E coverage for the approved application, experience, organization, and organization-submission query contracts, including ownership/visibility regression cases.

## 6. Verification

- [x] 6.1 Run `npm run build` from `/backend`.
- [x] 6.2 Run `npm run lint` from `/backend`.
- [x] 6.3 Run `npm test` from `/backend`.
- [x] 6.4 Run `npm run test:e2e` from `/backend`.
- [x] 6.5 Run `openspec validate backend-v2-pagination-totals` from the repository root.
