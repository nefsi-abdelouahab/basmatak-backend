## Why

Volunteers have no way to track what happens after they apply: delta doc V2 §B#5–§B#6 confirms My Applications and My Participations are blocked on joins, the real `under_review` state, date filters, activity, and streamed attestation downloads. Without them, volunteers cannot follow status, withdraw, or retrieve proof of completed work.

## What Changes

- New route `volunteer/applications`: own applications list with real `under_review` tab, `?status=` + `?from=&to=` filters, detail with neutral timeline (Submitted → Under review → Accepted), withdraw, "Application ID" as client-side ObjectId short form, no messaging UI.
- New route `volunteer/tasks`: own participations list/detail with org/task/schedule/location + position-deliverables joins, withdraw (seat freed), briefing/attestation downloads via the shared authed blob helper, no messaging UI.
- New API module `lib/api/tasks.ts` + hook file `hooks/useTasks.ts`; activity strip from `GET /volunteers/me/activity` on both routes; catalogs `messages/volunteer-tasks/{en,ar}.json` under prefix `volunteerTasks.*`.
- Attestation is a download link only (`GET /experiences/:experienceId/attestation`, streamed blob, `Content-Disposition: attachment`); submission editing/uploading stays in F7; experience visibility stays in F8.

## Capabilities

### New Capabilities
- `volunteer-applications`: own applications list/detail/withdraw, `under_review` tab, date filter, ObjectId short-form ID, neutral timeline, activity strip.
- `volunteer-tasks`: own participations list/detail/withdraw, joins, briefing/attestation blob downloads, activity strip.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 2 routes, 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme/i18n/api-client/blob-helper/primitives (no edits to shared or archived files).
- Depends on FB auth guards/session states; parallel-safe with F4/F5/F7/F8 (disjoint route dirs, `useTasks.ts`, `tasks.ts`, `volunteerTasks.*` prefix).
- Backend endpoints consumed (base `/api/v1`): `GET /applications/me`, `GET /applications/:applicationId`, `POST /applications/:applicationId/withdraw`, `GET /participations/me`, `GET /participations/:participationId`, `POST /participations/:participationId/withdraw`, `GET /volunteers/me/activity`, `GET /experiences/:experienceId/attestation`.
