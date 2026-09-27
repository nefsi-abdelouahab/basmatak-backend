## Why

Organizations have no self-serve opportunity management: delta doc V2 §B#10–§B#11 confirms My Opportunities and Create Opportunity are blocked on totals/search/sort/counts, owner single-read (incl. drafts), duplicate, category-from-API, cover upload, and the verified publish gate. Without this session, orgs cannot list, create, edit, lifecycle, or duplicate their opportunities.

## What Changes

- New route `org/opportunities`: own opportunities list with `q`/`sort`/`page`, per-card application/participant counts, `OPP-<registryId>` refs, owner single-read (incl. drafts), delete-draft, duplicate → independent draft. NO opportunity-PDF button; NO applications UI on the opportunity (F11).
- New routes `org/opportunities/new` + `org/opportunities/[id]` (edit): full v2 field set (`mode`, `endDate`, `durationMinutes`, `prerequisites[]`, `positions[].deliverables[]`/`startAt`, `coverMediaId` purpose `opportunity_cover`, category from `GET /skill-categories`, wilaya/municipality location), cover upload via shared 2-step flow (images ≤5 MB), positions CRUD, lifecycle actions (publish/close/cancel/complete) gated on verified + publish-gate. No perks/logistics inputs (FCD CUT).
- New API module `lib/api/orgOpps.ts` + hook file `hooks/useOrgOpps.ts`; catalogs `messages/org-opportunities/{en,ar}.json` under prefix `orgOpportunities.*`.
- Lifecycle-action availability matrix (draft vs published vs verified-gate) unit-tested; create → draft → publish (verified) / locked (pending) covered e2e.

## Capabilities

### New Capabilities
- `org-opportunities-list`: own opportunities list, search/sort/pagination, per-card counts, owner single-read, duplicate, delete-draft, no-PDF guard.
- `org-opportunity-editor`: create/edit form with all v2 fields, category-from-API, cover upload, positions CRUD, lifecycle actions with verified + publish-gate.

### Modified Capabilities
- None (backend contracts consumed as-is; F0 primitives consumed read-only; no spec-level behavior changes).

## Impact

- Frontend-only, `/frontend`: 3 route segments (`org/opportunities`, `org/opportunities/new`, `org/opportunities/[id]`), 1 api module, 1 hook file, 1 message prefix. Consumes F0 theme/i18n/api-client/blob-helper/primitives (no edits to shared or archived files).
- Depends on FB (auth guards/session states); parallel-safe with F9/F11/F12/F13 (disjoint route dirs, `orgOpps.ts`, `useOrgOpps.ts`, `orgOpportunities.*` prefix).
- Backend endpoints consumed (base `/api/v1`): `GET /organizations/me/opportunities`, `GET /organizations/me/opportunities/:id`, `POST /organizations/me/opportunities`, `PATCH /opportunities/:opportunityId`, `DELETE /opportunities/:opportunityId`, `POST /opportunities/:opportunityId/publish|close|cancel|complete`, positions `POST /opportunities/:opportunityId/positions` + `PATCH/DELETE /opportunities/:opportunityId/positions/:positionId`, `POST /organizations/me/opportunities/:id/duplicate`, `GET /skill-categories`, `GET /locations/wilayas`, `GET /locations/wilayas/:wilayaId/municipalities`, `POST /media/uploads`, `POST /media/:mediaId/confirm`.
