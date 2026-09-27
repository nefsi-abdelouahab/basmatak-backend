## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/orgRecords.ts`: `listOrgExperiences` with filters `q`, `opportunityId`, `visibility`, `sort`, `page` plus `buildOrgRecordsFilters` param builder, `exportOrgExperiencesCsv` via `?format=csv` through F0 `download.ts` blob helper, `downloadOrgAttestation`, `listOrgReviewsGiven` (endpoints: `GET /organizations/me/experiences` + `?format=csv`, `GET /experiences/:experienceId/attestation`, `GET /organizations/me/reviews`; `GET /verify/:verificationCode` as link target only, no fetch).
- [x] 1.2 No shared-file edits: `download.ts` consumed import-only; query-key factory namespaces `org-records` via the generic F0 factory with no archived-file touch.

## 2. Hooks (TanStack Query only; no fetch or axios in components)

- [x] 2.1 Add `hooks/useOrgRecords.ts`: archive list query with filter state, CSV export action, attestation download action, copy-verification-link action (`code` + `/verify/:code` with clipboard fallback to selectable text), reviews-given read query.
- [x] 2.2 Wire unified error mapping (401/403/404/429/503) and guest authed-action redirect to Login in the hook layer.

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440 + 1100 + 390)

- [x] 3.1 Add `app/[locale]/org/experiences/page.tsx`: archive table/cards showing volunteer name + `VOL-<id>`, `EXP-<registryId>`, verified date, inline code, `publicVisibility` display, real-duration hours; search/filter/sort controls; per-row copy-link + attestation buttons; CSV export button; loading + empty + error states; no ledger/SHA copy; no audio player; evidence link-type only.
- [x] 3.2 Add reviews-given read block on the same route from `GET /organizations/me/reviews` (read-only, neutral copy, no mutation affordance).
- [x] 3.3 Add `messages/orgRecords/en.json` + `ar.json` (prefix `orgRecords`); wire into next-intl config (catalogs auto-merge, never touch `src/i18n/request.ts`); RTL logical-properties check.
- [x] 3.4 Enriched-line formatting helpers colocated with the route dir; totals from page payload (`total`/`pages`); `publicVisibility` display only (no volunteer-side mutation here).

## 4. Tests (vitest + Playwright, viewports 1440 + 1100 + 390, locales en + ar)

- [x] 4.1 Unit: `buildOrgRecordsFilters` param mapping (incl. `format=csv` branch); CSV-request headers; copy-link string builder.
- [x] 4.2 E2E archive: filters + totals narrow the list; CSV downloads as attachment with no navigation; copy-link yields inline code + deep link; attestation per row downloads; reviews block renders read-only.
- [x] 4.3 E2E cross-cutting: full pass at 1440 + 1100 + 390 in en + ar with RTL mirror spot-check and F0 grep gates (no hardcoded theme, string, or fetch violations); neutral-copy guard (no `SHA-256`/`Ledger`/`DZ-CIVIC`/`National Civic Registry` strings, no audio element).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-org-records` + `openspec status --change frontend-org-records` clean; archive only after owner go on OQ1 + OQ2.
