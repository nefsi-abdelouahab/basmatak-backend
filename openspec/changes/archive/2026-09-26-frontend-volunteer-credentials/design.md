## Context

F0 (archived) shipped theme tokens, next-intl catalogs, axios client with 401 refresh-and-retry, TanStack Query plus key factory, components/ui primitives, the download-only blob helper lib/api/download.ts, and the 2-step upload helper lib/api/media.ts (added by F2, purpose avatar here reused with purpose portfolio_item). F8 builds the two missing volunteer credential screens (delta doc V2 section B item 7, CURRENT STATUS minor field-name update). Backend route truth was re-verified read-only in backend/src: GET experiences/me, GET experiences/:experienceId, PATCH experiences/:experienceId/visibility, GET experiences/:experienceId/attestation, GET volunteers/me/reviews, and portfolio GET me, POST me, PUT me/order, PATCH :itemId, DELETE :itemId all exist. No backend or archived-change edits are needed or allowed.

## Goals / Non-Goals

**Goals:**
- Two token-driven, en plus ar, RTL-correct routes (volunteer/experiences, volunteer/portfolio) at 1440, 1100, 390 viewports.
- One typed api function per consumed endpoint; all data via exactly the two roadmap-owned hook files; unit plus e2e coverage per roadmap section F8 Tests.
- Enriched experience display (verified-by org plus date plus inline code plus EXP-registryId) and portfolio typeLabel plus tags rendered from real payloads only.

**Non-Goals:**
- Public profile rendering (F17); any verify-page UI beyond an inline deep-link copy target; audio playback; Featured flags; single-item portfolio GET; any /backend or archived-change edits.

## Decisions

- **Two hook files as mandated, not a violation.** Roadmap assigns useExperiences.ts plus usePortfolio.ts to F8 (experiences vs portfolio concerns, mirroring F2 precedent). Rationale: portfolio reorder plus upload composition is independent from experience filters plus attestation; one file would couple unrelated lifecycles. No archived file is edited; deviation none.
- **Import-only reuse of F2 media.ts and F0 download.ts.** Portfolio media composes createUpload, uploadWithProgress, confirmUpload from lib/api/media.ts with purpose portfolio_item; attestation composes downloadBlob from lib/api/download.ts. Alternative (local upload or download code) rejected: exactly one shared path per mandate, and only F2 and F0 may own those files.
- **Filter params built in the api module, not the component.** buildExperienceFilters maps category, skill, from, to to query params so hooks stay thin and the builder is unit-testable. Alternative (inline params) rejected: roadmap Tests require filter-param unit coverage.
- **Reorder as full-sequence atomic PUT.** The portfolio UI edits order locally then PUTs the whole id sequence to PUT /portfolio/me/order; no per-item order PATCH exists. Alternative (optimistic per-item writes) rejected: backend accepts only the atomic batch.
- **Enriched line as presentational formatting in the route dir.** Verified by org on date plus code plus EXP-registryId is composed from payload fields by small pure helpers colocated with the experiences route. Alternative (shared component) rejected: shared ui is frozen since F0 and only F8 consumes this shape.
- **No portfolio single-item fetch.** Detail and edit forms bind to GET /portfolio/me list items because no single-item GET exists. Alternative (adding a backend route) rejected: never touch /backend.

## Risks / Trade-offs

- [Risk] Enriched payload field names (org identity join, verifiedAt, verificationCode, registryId) differ from design doc labels at implementation time -> Mitigation: Phase 2 first re-checks the live Swagger shape read-only and maps fields in the api module; specs bind behavior, not wire names.
- [Risk] Reorder interaction pattern is undefined by DESIGN.md (no design folder for these screens) -> Mitigation: explicit up and down plus save-order controls with token styling, proposed pending OQ2 confirm; isolated to one component.
- [Risk] Copy-to-clipboard unavailable in some contexts -> Mitigation: fallback shows the inline code as selectable text; covered by OQ1-adjacent e2e.
- [Trade-off] Two api plus hook file pairs widen the FC surface, accepted because the roadmap declares this split and files stay disjoint from F4 through F7.

## Migration Plan

None (new routes only). Rollback equals revert of the single F8 commit. Archive via openspec archive frontend-volunteer-credentials -y after green verification.

## Open Questions

- **OQ1 (STOP):** Confirm the exact enriched field projection for experiences (org display name key, verifiedAt format, verificationCode key, registryId key) against live Swagger before Phase 2, or confirm the spec field list as written is sufficient.
- **OQ2 (STOP):** Confirm the portfolio reorder interaction (up-down buttons plus save vs drag-and-drop) and the reviews block placement on volunteer/experiences (own section vs tab) before Phase 2.

