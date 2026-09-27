## Context

F0 (archived) shipped theme tokens, next-intl catalogs, axios client with 401 refresh-and-retry, TanStack Query + key factory, `components/ui` primitives, and the download-only blob helper `lib/api/download.ts`. FB (archived) shipped org onboarding (`useOrgOnboarding.ts`, `org/complete-profile`, `org/verification-dossier`). F12 builds the one missing FD archive screen (delta doc V2 §B#15, CURRENT STATUS minor field-name update: unbuildable → fully backed). Backend route truth was re-verified read-only in `backend/src`: `GET organizations/me/experiences` (+ `?format=csv` CSV branch in `verifications/experiences.controller.ts`), `GET organizations/me/reviews` (`reviews/reviews.controller.ts`), `GET verify/:verificationCode` (public-verification controller, link target only), `GET experiences/:experienceId/attestation` (attestation controller). No backend or archived-change edits are needed or allowed. F9 (`org/dashboard`, `useOrgStats.ts`) and F10 (`org/opportunities`, `useOrgOpps.ts`) are active in parallel; F12 files are disjoint from both by path.

## Goals / Non-Goals

**Goals:**
- One token-driven, en + ar, RTL-correct route (`org/experiences`) at 1440/1100/390 viewports.
- One typed api function per consumed endpoint; all data via exactly the roadmap-owned `hooks/useOrgRecords.ts`; unit + e2e coverage per roadmap §4 F12 Tests.
- Archive rows, CSV, copy-link, attestation, and reviews read rendered from real payloads only.

**Non-Goals:**
- Attestation generation (backend-owned); admin experience read (F15); any `/verify` page UI; ledger/SHA copy; audio playback; any `/backend` or archived-change edits.

## Decisions

- **Single capability, single hook/api pair as mandated.** `org-records` covers archive + CSV + copy-link + attestation + reviews read because the roadmap assigns exactly one route, one api module (`lib/api/orgRecords.ts`), and one hook file (`hooks/useOrgRecords.ts`) to F12. Rationale: all five concerns share one filter/page lifecycle on one screen; splitting would couple lifecycles across files. Alternative (two capabilities like F8) rejected: F8 split on two routes, F12 has one.
- **Import-only reuse of F0 `download.ts`.** Both CSV (`?format=csv`) and attestation downloads compose `downloadBlob` from the shared helper. Alternative (local download code) rejected: exactly one shared blob path per mandate, owned only by F0.
- **Filter params built in the api module, not the component.** `buildOrgRecordsFilters` maps `q`, `opportunityId`, `visibility`, `sort`, `page` to query params (plus `format=csv` for export) so the hook stays thin and the builder is unit-testable. Alternative (inline params) rejected: roadmap Tests require filter-builder and CSV-header unit coverage.
- **Copy-link as clipboard action with selectable-text fallback.** The action writes `code + /verify/:code` deep link; where clipboard is unavailable the inline code renders as selectable text. Alternative (dedicated verify page) rejected: roadmap explicitly forbids a verify page in this change.
- **Enriched line as presentational formatting colocated with the route.** Volunteer name + `VOL-<id>`, `EXP-<registryId>`, verified date, inline code, `publicVisibility` display, and real-duration hours are composed from payload fields by small pure helpers in the route dir. Alternative (shared component) rejected: shared `ui/*` is frozen since F0 and only F12 consumes this shape.
- **Reviews as a read-only block on the same route.** `GET /organizations/me/reviews` renders below the archive with no tabs invented beyond roadmap scope. Alternative (separate route) rejected: roadmap assigns one route dir to F12.

## Risks / Trade-offs

- [Risk] Enriched payload field names (volunteer join, `verifiedAt`, `verificationCode`, `registryId`, `durationMinutes`, `publicVisibility`) differ from design-doc labels at implementation time → Mitigation: Phase 2 first re-checks the live Swagger shape read-only and maps fields in the api module; specs bind behavior, not wire names.
- [Risk] CSV `Content-Disposition` handling differs between dev and prod storage → Mitigation: all downloads go through the tested F0 blob helper; e2e asserts attachment download with no navigation.
- [Risk] Parallel FD sessions (F9/F10 active) drift shared conventions → Mitigation: F12 consumes shared primitives import-only and owns disjoint paths; any needed shared change is flagged, not edited.
- [Trade-off] One large hook file covering five concerns, accepted because the roadmap mandates exactly `useOrgRecords.ts` and the concerns share one screen lifecycle.

## Migration Plan

None (new route only). Rollback equals revert of the single F12 commit. Archive via `openspec archive frontend-org-records -y` after green verification.

## Open Questions

- **OQ1 (STOP):** Confirm the exact enriched field projection for org experience rows (volunteer display-name key, `VOL` registry key, `verifiedAt` format, `verificationCode` key, `publicVisibility` key, duration-minutes key) against live Swagger before Phase 2, or confirm the spec field list as written is sufficient.
- **OQ2 (STOP):** Confirm the reviews block placement on `org/experiences` (own section below archive vs tab) and the CSV export scope (active-filters-only vs full archive) before Phase 2.
