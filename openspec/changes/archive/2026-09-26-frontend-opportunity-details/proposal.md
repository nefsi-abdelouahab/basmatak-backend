## Why

Volunteer opportunity discovery (F4 feed) has nowhere to land: there is no details route, so positions, apply, org context, and related opportunities are unreachable. V2 §B#3 unblocks the screen with real meta fields — this session builds it once, against the frozen v2 contract.

## What Changes

- ADDED route `app/[locale]/volunteer/opportunities/[idOrSlug]` (details + positions + org sidebar + related).
- ADDED `src/lib/api/opportunity.ts` with one typed function per consumed endpoint (detail, related, apply, withdraw, report, public cover read).
- ADDED `src/hooks/useOpportunity.ts` (this session's single hook file) over the API module via TanStack Query + key factory.
- ADDED `opportunityDetails` message-key prefix in per-area catalogs (`en`+`ar`); guest Apply → Login redirect via `next`.
- Detail binds real fields only (`mode`, dates, `durationMinutes`, `prerequisites`, `deliverables`, `coverMediaId`, positions with `applicationCount` + assigned names, org embed); "Ref" renders `OPP-<registryId>`; "Civic Recognition" renders neutral "Certificate" (attestation linked only where an experience exists — rendering owned by F8).
- Perks/logistics blocks REMOVED (FCD CUT — not built, no fields added).

## Capabilities

### New Capabilities
- `frontend-opportunity-details`: opportunity details route, opportunity API module, opportunity hook, apply/withdraw/report/related flows, and detail error-state bindings described above.

### Modified Capabilities
- None. F0 capabilities (`frontend-api-client`, `frontend-i18n`, `frontend-shell`, `frontend-theme`, `frontend-ui-primitives`) are consumed read-only.

## Impact

- Frontend only: `frontend/src/app/[locale]/volunteer/opportunities/[idOrSlug]/*`, `frontend/src/lib/api/opportunity.ts`, `frontend/src/hooks/useOpportunity.ts`, `frontend/src/messages/opportunityDetails/*`.
- No changes to `/backend`, `backend-inventory.md`, `docs/API.md`, F0 shared primitives, or any archived change.
- Out of scope (explicit): attestation rendering (F8); org-side editing (F10); public opportunity details (F18).
