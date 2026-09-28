## Why

Volunteers have no self-service view of their verified credentials: delta doc V2 section B item 7 confirms My Experiences was blocked (PDF export, audio, filters, verified-by join, registry codes). Without it, volunteers cannot prove participation, control experience visibility, download attestations, or curate a portfolio.

## What Changes

- New route volunteer/experiences: enriched experience list plus detail from GET /experiences/me and GET /experiences/:experienceId with query filters categoryId, skillId, from, to; each record shows verified-by-org plus date plus inline verification code plus EXP-registryId; visibility toggle via PATCH /experiences/:experienceId/visibility; attestation download via GET /experiences/:experienceId/attestation through the shared blob helper; public reviews read via GET /volunteers/me/reviews.
- New route volunteer/portfolio: portfolio CRUD plus reorder via GET /portfolio/me, POST /portfolio/me, PATCH /portfolio/:itemId, DELETE /portfolio/:itemId, PUT /portfolio/me/order with typeLabel and tags metadata; media attach via the shared 2-step upload helper (POST /media/uploads purpose portfolio_item, then PUT bytes, then POST /media/:mediaId/confirm).
- New API modules lib/api/experiences.ts plus lib/api/portfolio.ts; hooks hooks/useExperiences.ts plus hooks/usePortfolio.ts; catalogs under own message-key prefix volunteerCredentials (en plus ar).
- Audio evidence dropped (images, PDF, link only, no audio player); Audited 100 percent copy removed; durations from real durationMinutes.

## Capabilities

### New Capabilities
- volunteer-experiences: own enriched experience records, category and skill and date filters, visibility toggles, attestation downloads, reviews read.
- volunteer-portfolio: own portfolio CRUD plus order plus typeLabel and tags metadata with 2-step media attach.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, under /frontend: 2 routes (volunteer/experiences, volunteer/portfolio), 2 api modules, 2 hook files, 1 message prefix. Consumes F0 theme, i18n, api-client, primitives plus F2 media.ts upload helper and F0 download.ts blob helper (import-only, no edits).
- Out of scope: public profile rendering (F17); no edits to /backend, docs/API.md, or any archived change.

