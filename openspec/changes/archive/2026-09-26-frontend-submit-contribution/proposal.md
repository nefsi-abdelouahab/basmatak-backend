## Why

Volunteers have no way to report completed work: delta doc V2 §B#8 confirms Submit Contribution is backed by real v2 routes (`submissions.title`, 2-step media, `consentConfirmed`, rejected→draft) but has no frontend. Without it, participations stall before verification and the org review inbox (F11) stays empty.

## What Changes

- New route `volunteer/tasks/[participationId]/submit`: draft editor (`title` ≤200, `description` ≤5000, evidence gallery), 2-step evidence upload with progress, video-as-link add, imagery-consent checkbox gate, submit action, submitted/under_review/approved/rejected status display, rejected→draft→resubmit loop.
- New API module `lib/api/submissions.ts` (one typed fn per consumed endpoint) + hook file `hooks/useSubmissions.ts` (TanStack Query only); reuses F2 `lib/api/media.ts` 2-step helper (import-only, no edits).
- New catalogs `messages/submit-contribution/{en,ar}.json` (prefix `submitContribution.*`); consumes F0 theme/primitives/i18n/api-client read-only.
- Removes old-copy claims: no "Up to 500 MB / video / audio / zip" copy, no single-step gallery, no "Message coordinator" affordance.

## Capabilities

### New Capabilities
- `submit-contribution`: draft/submit lifecycle, v2-correct evidence upload (≤5 MB jpeg/png/webp/pdf + video-as-link allowlist) with progress, `consentConfirmed` gate, rejected→draft→resubmit, no messaging UI.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 1 route dir, 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme/i18n/api-client/primitives and F2 `lib/api/media.ts` (no edits to archived files).
- Depends on FB auth guards + F6 participation context (read-only link from `volunteer/tasks`); F11 consumes submitted records via its own `orgInbox.ts` (no shared-file edits either direction).
- Endpoints consumed (all `/api/v1`): `POST /participations/:participationId/submissions`, `PATCH /submissions/:submissionId`, `POST /submissions/:submissionId/submit`, `GET /submissions/me`, `GET /submissions/:submissionId`, `POST /media/uploads`, `POST /media/:mediaId/confirm`, `POST /media/links`, `DELETE /media/:mediaId`.
