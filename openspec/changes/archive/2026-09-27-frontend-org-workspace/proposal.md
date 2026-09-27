## Why

Organizations have no home screen: delta doc V2 §B#9 confirms the Organization Dashboard was blocked on cover/location/founded facts, private aggregates, joined inboxes, activity, and publish-gate surfacing. Without it, orgs cannot see health at a glance, find pending review work, or understand why publishing is locked.

## What Changes

- New route `org/dashboard`: org fact header (cover/location/founded + `ORG-<registryId>`), stat cards from `GET /organizations/me/stats`, submissions-to-review summary + recent-applications summary (joins, links onward), activity feed, publish-gate banner.
- New API module `lib/api/orgStats.ts` + hook file `hooks/useOrgStats.ts`: one typed function per consumed endpoint (me, stats, participants summary, submissions inbox summary, applications aggregate summary, activity, publish-gate, notifications read); hours render from `verifiedHours` (backend `sum(durationMinutes)`).
- New catalogs `messages/org-workspace/{en,ar}.json` under prefix `orgWorkspace.*`; real `coverMediaId` cover or neutral empty state (never a placeholder image).
- Out of scope: opportunity CRUD (F10 owns `org/opportunities*` + `useOrgOpps.ts`); review-queue detail + approve/reject (F11 owns `org/applications|participants|contributions` + `useOrgInbox.ts`).

## Capabilities

### New Capabilities
- `org-workspace`: organization dashboard — fact header, stat cards, inbox summaries, activity feed, publish-gate surfacing, notification strip.

### Modified Capabilities
- None (backend contracts consumed as-is; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 1 route dir (`app/[locale]/org/dashboard`), 1 api module (`lib/api/orgStats.ts`), 1 hook file (`hooks/useOrgStats.ts`), 1 message prefix (`orgWorkspace.*`). Consumes F0 theme/i18n/api-client/primitives + FB auth guards read-only (no shared or archived-file edits).
- Depends on FB (F1/F2/F3 archived); parallel-safe with FC and FD siblings F10–F13 (disjoint route dirs, `orgStats.ts`/`useOrgStats.ts`, `orgWorkspace.*` prefix).
- Backend endpoints consumed (base `/api/v1`): `GET /organizations/me`, `GET /organizations/me/stats`, `GET /organizations/me/participants`, `GET /organizations/me/submissions`, `GET /organizations/me/applications`, `GET /organizations/me/activity`, `GET /organizations/me/publish-gate`, `GET /notifications`.
