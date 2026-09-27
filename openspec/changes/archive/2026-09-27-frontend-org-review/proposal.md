## Why

Organizations cannot act on incoming demand: delta doc V2 §B#12–§B#14 confirms the Applications inbox, Participants roster, and Contributions verification inbox are blocked on the real `under_review` state, aggregate inboxes with joins, reject-with-reason, and the single atomic approve-and-mint. Without them, orgs cannot review applicants, manage participants, or verify submitted work.

## What Changes

- New route `org/applications`: cross-opportunity applications inbox (`?opportunityId=&status=&q=&page=`) plus per-opportunity view, real `under_review` via start-review, accept, reject with required-reason dialog, applicant skills/experiences via public-profile read, persisted cover `message`, no messaging UI ("Ask clarification" stays deleted).
- New route `org/participants`: aggregate roster incl. `completed` with submission-state/files join, `?q=&opportunityId=&status=&page=`, labels aligned to real participant/submission statuses, remove with required reason, no messaging UI.
- New route `org/contributions`: submissions verification inbox with multi-status (`submitted,under_review`), `?q=&format=&sort=`, totals + volunteer join, single "Approve & issue verification" (atomic verify incl. mint, copy states minting happens on approval), reject with required reason ("Changes requested" maps to `rejected`), neutral `review` notes, owning-org private evidence render, no council/compliance copy.
- New API module `lib/api/orgInbox.ts` + hook file `hooks/useOrgInbox.ts`; catalogs `messages/org-review/{en,ar}.json` under prefix `orgReview.*`.

## Capabilities

### New Capabilities
- `org-applications`: aggregate + per-opportunity applications inbox, start-review/accept/reject-with-reason, applicant public-profile reads, exact-enum tabs, multi-status query builder.
- `org-participants`: aggregate + per-opportunity roster incl. completed, submission join, remove-with-reason, real status labels.
- `org-contributions`: submissions inbox (multi-status, search/format/sort, totals, joins), start-review/verify-single-approve-mint/reject-with-reason, verification read, owning-org evidence render.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 3 routes, 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme/i18n/api-client/blob-helper/primitives + FB auth guards (no edits to shared or archived files).
- Depends on FB (archived); parallel-safe with F9/F10/F12/F13 (disjoint route dirs, `orgInbox.ts`/`useOrgInbox.ts`, `orgReview.*` prefix). Verified-experiences archive + CSV stays in F12.
- Backend endpoints consumed (base `/api/v1`): `GET /organizations/me/applications`, `GET /opportunities/:opportunityId/applications`, `POST /applications/:applicationId/start-review|accept|reject` (`{reason}`), `GET /organizations/me/participants`, `GET /opportunities/:opportunityId/participants`, `POST /participations/:participationId/remove` (`{reason}`), `GET /organizations/me/submissions`, `GET /submissions/:submissionId`, `POST /submissions/:submissionId/start-review|verify|reject`, `GET /verifications/:verificationId`, `GET /volunteers/:username`, `GET /media/:mediaId` (owning-org private evidence).
