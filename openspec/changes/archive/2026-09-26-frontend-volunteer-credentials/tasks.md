## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add lib/api/experiences.ts: listMyExperiences with filters categoryId, skillId, from, to plus buildExperienceFilters param builder, getExperienceDetail, patchExperienceVisibility, downloadAttestation via F0 download.ts blob helper, listMyReviews (endpoints: GET /experiences/me, GET /experiences/:experienceId, PATCH /experiences/:experienceId/visibility, GET /experiences/:experienceId/attestation, GET /volunteers/me/reviews).
- [x] 1.2 Add lib/api/portfolio.ts: listMyPortfolio, createPortfolioItem, patchPortfolioItem, deletePortfolioItem, reorderPortfolio as full-sequence PUT (endpoints: GET /portfolio/me, POST /portfolio/me, PATCH /portfolio/:itemId, DELETE /portfolio/:itemId, PUT /portfolio/me/order); media attach composes F2 lib/api/media.ts 2-step flow with purpose portfolio_item, jpeg png webp pdf at 5 MB max, link items as plain URLs.
- [x] 1.3 No shared-file edits: media.ts and download.ts consumed import-only; query-key factory namespaces volunteer-experiences and volunteer-portfolio via the generic F0 factory with no archived-file touch.

## 2. Hooks (TanStack Query only; no fetch or axios in components)

- [x] 2.1 Add hooks/useExperiences.ts: list query with filter state, detail query, visibility mutation with refetch, attestation download action, reviews read query, copy-verify-link action with clipboard fallback to selectable text.
- [x] 2.2 Add hooks/usePortfolio.ts: ordered list query, create plus patch plus delete mutations with refetch, local reorder state plus atomic PUT /portfolio/me/order save, upload composition over lib/api/media.ts with pre-upload size and type guard.

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440 plus 1100 plus 390)

- [x] 3.1 Add app/[locale]/volunteer/experiences/page.tsx: enriched cards showing verified-by org plus date plus inline code plus EXP-registryId, category plus skill plus date filters, visibility toggles, attestation download buttons, copy-verify-link action, reviews read block, loading plus empty plus error states via F0 error mapping incl 401 plus 403 plus 404 plus 429, guest access redirects to Login.
- [x] 3.2 Add app/[locale]/volunteer/portfolio/page.tsx: ordered grid with typeLabel plus tags plus visibility, create plus edit dialog with metadata fields, delete confirm dialog, up-down reorder plus save order, media attach with progress, no audio player, no Featured flag, no single-item fetch.
- [x] 3.3 Add messages/volunteer-credentials/en.json plus ar.json (prefix volunteerCredentials); wire into next-intl config; RTL logical-properties check.
- [x] 3.4 Enriched-line formatting helpers colocated with the experiences route; durations from the numeric duration field (minutes); Audited 100 percent copy absent; evidence affordances image plus PDF plus link only.

## 4. Tests (vitest plus Playwright, viewports 1440 plus 1100 plus 390, locales en plus ar)

- [x] 4.1 Unit: buildExperienceFilters param mapping; visibility-toggle gating; reorder sequence builder; oversize and wrong-type guard blocks before POST /media/uploads.
- [x] 4.2 E2E experiences: toggle visibility persists across reload; attestation downloads as attachment with no navigation; filters narrow the list; copy action yields inline code plus deep link; reviews render read-only.
- [x] 4.3 E2E portfolio: CRUD plus reorder plus metadata persist across reload; upload shows progress then renders; no audio player in DOM; full pass at 1440 plus 1100 plus 390 in en plus ar with RTL mirror spot-check and F0 grep gates (no hardcoded theme, string, or fetch violations).

## 5. Verify plus archive (from /frontend, then repo root)

- [x] 5.1 npm run build, npm run lint, npm test, npm run test:e2e green.
- [x] 5.2 openspec validate frontend-volunteer-credentials plus openspec status --change frontend-volunteer-credentials clean; archive only after owner go on OQ1 plus OQ2.

