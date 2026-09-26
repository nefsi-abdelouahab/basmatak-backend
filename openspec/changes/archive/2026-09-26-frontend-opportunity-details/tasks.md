## 1. Opportunity API module (API ACCESS)

- [x] 1.1 Create `frontend/src/lib/api/opportunity.ts` with zod schemas and 6 typed functions (`GET /opportunities/:idOrSlug`, `GET /opportunities` related-by-category, `POST /opportunities/:opportunityId/positions/:positionId/applications` with `{message?}` ≤2000, `POST /applications/:applicationId/withdraw`, `POST /reports` with `targetType: "opportunity"`, `GET /media/:mediaId` cover read) on the F0 axios singleton; no `fetch(`/raw `axios.` outside `lib/api`.
- [x] 1.2 Unit-test the API module (id-or-slug path building, message validation, report payload shape, related filter params).

## 2. Opportunity hook + gating (API ACCESS)

- [x] 2.1 Create `frontend/src/hooks/useOpportunity.ts` (single hook file) with TanStack Query detail + related queries (key-factory keys) and apply/withdraw/report mutations that invalidate the detail query on success.
- [x] 2.2 Implement and unit-test deadline/seat gating (`applicationDeadline` past, `filledCount >= requiredCount`, non-`published` status disables Apply) plus guest-redirect helper wiring via `getLoginHref(locale, next)`.
- [x] 2.3 Resolve the own-application id for Withdraw without new endpoints (blocked on OQ1 confirm; if lookup path changes, flag rather than touching another session's files).

## 3. Detail route shell + meta (THEME + I18N + RESPONSIVE)

- [x] 3.1 Build `app/[locale]/volunteer/opportunities/[idOrSlug]` shell (breadcrumb with `OPP-<registryId>` chip, header card with org name + verified badge, title, description) consuming `components/ui/*` read-only; no hardcoded color/font/spacing values.
- [x] 3.2 Build real-meta boxes (`mode`, dates, `durationMinutes`→hours, `prerequisites[]`, category/skill/location labels, cover) with zero hardcoded JSX strings; perks/logistics blocks absent by construction (FCD CUT grep gate).
- [x] 3.3 Build neutral "Certificate" box (no "Civic Recognition" copy; attestation link only where an experience exists per OQ2 confirm — F8 owns rendering).

## 4. Positions + apply/withdraw/report (API ACCESS + I18N)

- [x] 4.1 Build selectable position cards (`applicationCount`, assigned names, skills, `deliverables[]`/`startAt`, seat states) with per-position Apply CTA wired to the apply mutation (`{message?}` dialog).
- [x] 4.2 Build Withdraw (confirm dialog → withdraw mutation → re-read shows freed seat) and Report (reason-required dialog → `POST /reports`; guests redirect to Login).
- [x] 4.3 Bind error codes through F0's mapper (`EMAIL_NOT_VERIFIED` CTA, 404 non-published, 409 `POSITION_FULL`/`DUPLICATE_APPLICATION`, 410 closed/deadline, 429 rate-limited, 401 guest) with loading/empty/error states.

## 5. Org sidebar + related + cover (API ACCESS + THEME + RESPONSIVE)

- [x] 5.1 Build org sidebar strictly from the detail `organization` embed (no extra endpoint, no invented stats) and cover via `GET /media/:mediaId` with a neutral token-driven empty state.
- [x] 5.2 Build related strip (`GET /opportunities` by `categoryId`, self filtered out, card fields + `OPP-<registryId>`, links to related details); empty strip collapses silently.

## 6. Message catalogs (I18N)

- [x] 6.1 Ship `messages/opportunityDetails/en.json` + `messages/opportunityDetails/ar.json` (`opportunityDetails.*` prefix only) merged additively in `i18n/request.ts`; logical properties only; RTL smoke en↔ar.

## 7. Tests (RESPONSIVE + I18N)

- [x] 7.1 E2E (mocked): apply with message → success + re-read; guest apply → login with `next`; withdraw; report with reason; related list renders; viewport matrix 1440/1100/390; locales en+ar.

## 8. Session gates

- [ ] 8.1 From `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green; theme grep gate clean (no hex outside `theme/`); file-disjointness check (only `volunteer/opportunities/[idOrSlug]/*`, `lib/api/opportunity.ts` + test, `hooks/useOpportunity.ts` + test, `messages/opportunityDetails/*` + parity test, `e2e/opportunity-details.spec.ts` touched, plus the approved additive `i18n/request.ts` merge; no F4/F6/F7/F8/F10/F18-owned files edited).
  - STATUS (2026-09-26): lint CLEAN; theme/fetch grep gates CLEAN; `tsc --noEmit` reports ZERO errors in F5 files + `request.ts`; F5 unit tests 18/18 green; F5 e2e 24/24 green (viewport matrix 1440/1100/390, en+ar — run in an isolated filesystem copy on port 3131 because parallel FC sessions share port 3100 + `.next`). BLOCKED (out of scope, parallel-session files, flagged not fixed): `npm run build` red on F6's `volunteer/tasks/ParticipationDetail.tsx:133` type error; full `npm test` has 2 failures in F4's in-flight `feed.test.ts`/`favorites.test.ts`. Re-run canonical build/test/e2e once F4/F6 land.
- [x] 8.2 From repo root: `openspec validate frontend-opportunity-details` clean; confirm tree contains only this session's files before any commit.
