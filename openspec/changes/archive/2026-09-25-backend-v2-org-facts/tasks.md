## 1. Schema and DTOs

- [x] 1.1 Extend `OrganizationSchema` with `coverMediaId`, `type` (≤ 80), `registrationNumber` (≤ 80), `location {wilayaId, municipalityId, address ≤ 500}`, `website` (≤ 500), `foundedYear`, `contact {email ≤ 254, phone}`, `focusDisciplines[]` (default `[]`), `operatingScope` (≤ 120), `publicProfile {enabled}` (default `true`), `annualReportMediaId` (nullable); assert no perks-equivalent paths and no `registryId` write path.
- [x] 1.2 Extend `UpdateOrganizationDto` with the new fields and validation (`IsUrl` http/https website, canonical phone regex, `foundedYear` 1800–current year, `IsEmail` contact email, `IsMongoId` focusDisciplines ≤ 12, nested `location`/`contact`/`publicProfile` with `forbidNonWhitelisted`); protected keys (`userId`, `slug`, `registryId`, `verificationStatus`, `status`) stay absent.
- [x] 1.3 Add `OrgOpportunitiesQueryDto` (`status` in `published|completed|closed`, default `published`) and the profile-completion response shape; verify no new index is required (own reads by `userId`, public reads by `slug` — both already indexed).

## 2. Seam

- [x] 2.1 Create `src/common/seams/org-public-stats.ts` (`ORG_PUBLIC_STATS_PROVIDER` token, `OrgPublicStatsProvider` interface, `InertOrgPublicStatsProvider` zeroed default with `activeSince` from `foundedYear` else `null`); bind the inert default in the organizations module.

## 3. Service logic

- [x] 3.1 Persist new fields on `updateOwn` (merged-pair handling for nested `location`/`contact`/`publicProfile`; `MediaOwnership.assertFor` for `coverMediaId`/`annualReportMediaId` with `organization_cover`/`organization_document`; location refs validated against seeded wilaya/municipality → `INVALID_LOCATION`; focusDisciplines existence-checked → `INVALID_FOCUS_DISCIPLINE`; no email-verification gate).
- [x] 3.2 Implement `getProfileCompletion` (11-key checklist, `percent` 0–100, `complete` flag; `annualReportMediaId` excluded).
- [x] 3.3 Implement `deleteOwn` as a single transaction (org `status=deleted` + user retired + sessions revoked via the Session 6 helper + `status_histories`/`audit_logs` writes).
- [x] 3.4 Extend `getPublicBySlug` payload with fact-sheet fields + seam `aggregates` (null-safe for legacy rows; `publicProfile.enabled=false` still resolves); implement `listOrgOpportunities(slug, status)` in the organizations service and delegate to it from the canonical opportunities-controller archive route (Session 11 ownership; remove the shadowed V1 stub route in `OrganizationsController`).

## 4. Routes

- [x] 4.1 Add `GET /organizations/me/profile-completion` and `DELETE /organizations/me` in `OrganizationsController` (all `me/*` routes declared before `:slug`); extend the canonical opportunities-controller archive route with `?status=` delegating to the organizations service; remove the shadowed V1 stub route in `OrganizationsController`; keep the registration endpoint untouched.

## 5. Tests and verification

- [x] 5.1 Unit tests: website/phone/foundedYear validation, completion-% math, location/discipline rejection codes, seam inert-default shape, delete-transaction atomicity (forced mid-failure mock).
- [x] 5.2 E2E tests: full PATCH → `/me` + public `/:slug` reflect; email-unverified PATCH allowed; delete revokes sessions + hides public org + kills refresh; annual report requires `organization_document` purpose; per-status opportunities filtering + `400` on bad status; schema-keys guard against perks-equivalent fields.
- [x] 5.3 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`; run `openspec validate backend-v2-org-facts` from repo root.
