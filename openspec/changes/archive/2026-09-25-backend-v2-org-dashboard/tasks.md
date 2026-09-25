## 1. Open-question gate (do first — no code until answered)

- [x] 1.1 Confirm Q1–Q5 from design.md with the owner (hours window, initiative mapping, perDomain denominator, decisions-30d source, roster hourlyTotal) and amend specs/design to the answers before implementing.

## 2. Provider (real seam implementations)

- [x] 2.1 Register `Applications` + `Submissions` models in `ParticipationsModule` via `MongooseModule.forFeature` (every other model arrives via `OrganizationsModule`/`VolunteersModule` re-exports).
- [x] 2.2 Add the `task_participants(organizationId,status)` index (in-scope file). The `volunteer_experiences(organizationId)` index is DEFERRED: that schema is owned by archived Session 15 and the owner limited archived touches to the two DI swaps — hours reads stay org-scoped and bounded without it.
- [x] 2.3 Implement `OrgPublicStatsProviderImpl` + `OrgFootprintProviderImpl` over shared DI-free helpers in `org-dashboard.aggregates.ts` (two slim classes so each binding scope satisfices deps — see design); reliability values read from the cached `organizations.reliability` snapshot only.
- [x] 2.4 Swap DI bindings (one provider line each, nothing wider): `organizations.module.ts` `ORG_PUBLIC_STATS_PROVIDER` and `admin.module.ts` `ORG_FOOTPRINT_PROVIDER` to the real provider (Session 15 precedent); stop and flag if either diff grows beyond the binding line.

## 3. Routes (roster + private stats)

- [x] 3.1 Add roster query DTO (`q`, `opportunityId`, `status` single `IsIn(PARTICIPANT_STATUSES)`, cursor `limit`) with whitelist + `forbidNonWhitelisted`.
- [x] 3.2 Implement roster aggregation in an org-dashboard service: own-org scoping, two-phase `q` id-filter, `execPage`, batched joins (profiles, opportunities/positions, latest submission per participant, hourly totals).
- [x] 3.3 Implement `GET /organizations/me/stats` aggregation (opportunity/application/participant counts, hours sum, decisions-30d, cached decidedRatio/medianDecisionHours).
- [x] 3.4 Add `OrgDashboardController` (`@Controller('organizations/me')`, `@Roles('organization')`, `GET participants` / `GET stats`) to the participations module; verify no route collision with `:slug` and no edits to archived controllers/services.

## 4. Tests

- [x] 4.1 Unit: provider formulas (volunteers distinct, hours sum, responseRate cache passthrough/fallback, perDomain math/cap, footprint shapes, empty-org zeros); roster join/status vocab; stats counts.
- [x] 4.2 E2E: seed 2 orgs → roster scoped per org with correct joins, `?status=completed` included, foreign `opportunityId` 404, guest 401 / volunteer 403; `/me/stats` and public `:slug` aggregates match DB; reliability-cold org yields zeros.

## 5. Verify, archive, commit

- [x] 5.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; from repo root: `openspec validate backend-v2-org-dashboard`.
- [ ] 5.2 Confirm disjointness (no files outside `participations/org-dashboard.*`, DTOs, the two binding lines, indexes, tests) and that no S6-peer file was touched; then `openspec archive backend-v2-org-dashboard -y`.
- [ ] 5.3 Commit locally with `feat(backend-v2-org-dashboard): participant roster, org aggregates and public org stats` (stage only this session's files; never push).
