## Why

The roadmap's list result-count banners, page controls, sorting controls, and multi-select filters cannot be fulfilled by the current cursor-only responses. A shared, counted pagination contract is needed before later sessions extend these same lists.

## What Changes

- Populate the shared cursor-page response with required `total`, `page`, and `pages` values, without replacing cursor pagination.
- Add one reusable counted-page execution path and use it for the roadmap list endpoints, including existing participation and notification cursor lists; do not add Session 8 admin-list totals.
- Extend the public opportunity feed with validated sorting, comma-separated multi-value filters, authenticated volunteer `nearMe=me`, and the specified date-window behavior.
- Extend the public talents list with the specified filters, validated sorting, and skill/wilaya facet counts.
- Add the specified additive filters and sorting to own/application/submission/organization list routes, and optional draft-settable `submissions.title`.
- Preserve existing visibility, ownership, cursor, and status behavior. This change does not add embeds, position application counts, exports, analytics, or new list endpoints.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `common-core`: cursor pagination returns counted page metadata through a reusable page/count contract.
- `opportunities`: public and organization-owned opportunity lists accept the roadmap sorting, multi-filter, location, and date-window parameters.
- `volunteers`: the public talents list accepts the roadmap filters, sorting, and facet counts.
- `applications`: application lists accept the roadmap date, search, status, and sorting parameters with counted pages.
- `submissions`: submission title and organization-inbox filters/sorting are supported with counted pages.
- `experiences`: the volunteer's own experience list accepts category, skill, and date filters with counted pages.
- `organizations`: public organization search supports `q` and cursor page metadata.

## Impact

Backend changes are confined to `common/pagination` and list DTOs/services/controllers in opportunities, volunteers, applications, submissions, verifications, organizations, participations, and notifications. No packages, environment variables, migrations, or routes are added; `submissions.title` is the only write-model addition.
