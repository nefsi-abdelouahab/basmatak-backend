## Why

The pre-presentation discovery pass needs a saved-items page, cleaner opportunity presentation, and mobile fixes. Organizations were declared in scope for favorites (decision D1), but the favorites backend and frontend only support opportunities and talents today.

## What Changes

- Add `organization` as a favorites target type. The toggle routes resolve the organization slug server-side and store `organizations.userId` as `targetId`, mirroring the talent-by-username contract.
- Extend own-list, counts, and lookup responses with the organization branch. List summaries gain `status`, `applicationDeadline`, and the opportunity's organization embed so the saved-items page can render useful, non-sensitive metadata.
- Add a volunteer-only Save action to the public organization profile and a third tab to the saved-items page.
- Keep the existing opportunity/talent contracts unchanged; every change is additive.
- The remaining discovery tasks (opportunity display, mobile fixes, UI consistency) follow in separate commits under this change.

## Capabilities

### Modified Capabilities
- `favorites`: organization toggle by slug, organization-aware list/counts/lookup, and the widened data model.
- `volunteer-favorites`: organization save on the public profile, third saved-items tab, and status-aware rows.

## Impact

- Backend: `favorites` schema/service/controller/module and service tests.
- Frontend: favorites API/hooks, saved-items route, public organization profile, shell navigation, and the favorites message catalog.
- No database migration beyond the existing unique index (the new target type reuses it).
