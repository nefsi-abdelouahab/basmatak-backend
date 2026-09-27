## Why

Organizations have no self-service archive of the experiences they verified: delta doc V2 §B#15 confirms the Verified Experiences screen was unbuildable (no endpoint) and is now fully backed. Without it, orgs cannot audit their minted verifications, export records, share verification links, or read the reviews they gave.

## What Changes

- New route `org/experiences`: verified-experiences archive from `GET /organizations/me/experiences` with search/filter/sort (`q`, `opportunityId`, `visibility`, `sort`, `page`) and totals from the page payload; each row shows volunteer name + `VOL-<registryId>`, `EXP-<registryId>`, verified date from `verifiedAt`, inline `verificationCode`, `publicVisibility` display, and hours from real `durationMinutes`.
- CSV export of the same list via `?format=csv` through the single shared authed blob-download helper (`Content-Disposition: attachment`, no navigation).
- "Copy verification link" action copies the inline code plus deep-link target `/verify/:code` (link target only — no verify page UI built).
- Per-row attestation download via `GET /experiences/:experienceId/attestation` through the same blob helper.
- Org reviews given read via `GET /organizations/me/reviews` rendered read-only in the same route.
- New API module `lib/api/orgRecords.ts`; hook `hooks/useOrgRecords.ts`; catalogs under own message-key prefix `orgRecords` (en + ar).
- Neutral copy only: no ledger/SHA, no `DZ-CIVIC` registry IDs, no audio playback (link-type evidence only).

## Capabilities

### New Capabilities
- org-records: org verified-experiences archive with filters, CSV export, verification-link copy, attestation downloads, `publicVisibility` display, and org reviews-given read.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, under `/frontend`: 1 route (`org/experiences`), 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme, i18n, api-client, primitives and the F0 `download.ts` blob helper (import-only, no edits).
- Out of scope: attestation generation (backend-owned); admin experience read (F15). No edits to `/backend`, `backend-inventory.md`, `docs/API.md`, or any archived change.
