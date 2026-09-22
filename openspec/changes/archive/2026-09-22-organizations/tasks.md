## 1. Schemas and status machine

- [x] 1.1 Add the `Organization` schema via `createSchema` (`userId` ObjectId unique, `slug` unique, `nameAr`/`nameFr`, `description`, `logoMediaId?`, `verificationStatus` `pending|verified|rejected` default `pending`, `status` `active|suspended|deleted` default `active`, `reliability` placeholder sub-document) with indexes unique `userId`, unique `slug`, and `(verificationStatus, status)`
- [x] 1.2 Add the `OrganizationVerification` schema via `createSchema` (`organizationId`, `status` `pending|verified|rejected`, `documents` `[ObjectId]`, `rejectionReason?`, `submittedAt`, `decidedAt?`, `decidedBy?`) with index `(organizationId, status)`
- [x] 1.3 Register the `organization` entity whitelist in `StatusTransitionRegistry` at module bootstrap: `pending→verified`, `pending→rejected`, `rejected→pending` (F1 machine; only `rejected→pending` exercised here)

## 2. Organizations service and registration seam

- [x] 2.1 Implement `OrganizationsService`: `findPublicBySlug`/`getPublicOrganization(slug)` (verified + active, else `null`), `findById`, `findByUserId`, `listPublic` (verified + active), `updateOwn`, `submitVerification`, `getVerificationStatus`
- [x] 2.2 Implement `OrganizationRegistrationExtrasService` (`createExtras`) dispatching on `user.role`: `organization` → create the `organizations` row (`userId = user.id`, slug via `slugifyText(emailLocalPart)` → `createWithUniqueSlug` with E11000 retry, `verificationStatus=pending`); every other role → delegate to the injected `InertRegistrationExtrasService` (parallel-merge rule, no behavior change for non-organization roles)
- [x] 2.3 Override the `REGISTRATION_EXTRAS_SERVICE` provider binding in `src/common/common.module.ts` (`useClass: OrganizationRegistrationExtrasService`) without altering the inert default's role or any other provider. Note: the concurrent Session 4 (volunteers) chain superseded the token to `VolunteerRegistrationExtrasService`, which dispatches every non-volunteer role to `OrganizationRegistrationExtrasService` — same org behavior end-to-end (verified by e2e).
- [x] 2.4 `PATCH /organizations/me` field rules: `userId`, `slug`, `verificationStatus`, `status` never settable from the body (DTO forbids them); `logoMediaId` optional ObjectId-format only; slug never regenerated server-side on patch

## 3. Controllers and routes

- [x] 3.1 Implement `OrganizationsController` with route ordering (§2.7 trap): `GET /organizations/me`, `PATCH /organizations/me`, `POST /organizations/me/verification`, `GET /organizations/me/verification` declared BEFORE `GET /organizations/:slug` and `GET /organizations/:slug/opportunities`
- [x] 3.2 Public routes: `GET /organizations` (only verified + active, ordered), `GET /organizations/:slug` (404 unless verified + active via the public seam), `GET /organizations/:slug/opportunities` (404 unless verified + active; otherwise `[]` until S6 owns the model); mark them `@Public()`
- [x] 3.3 `POST /organizations/me/verification`: `documents` as `@IsArray` `@ArrayMinSize(1)` of `@IsMongoId()` strings; 403 `EMAIL_NOT_VERIFIED` when the caller's `users.emailVerifiedAt` is unset (A10, route-level regardless of `EMAIL_VERIFICATION_REQUIRED`); from `pending` insert a new row keeping `pending`; from `rejected` run `StatusTransitionService.assert('organization', orgId, 'rejected', 'pending', userId)` then set `verificationStatus=pending` and insert the row; from `verified` → 409 `ORG_ALREADY_VERIFIED`
- [x] 3.4 `GET /organizations/me/verification`: latest `organization_verifications` row (status, `rejectionReason` when rejected, `submittedAt`) plus the org's current `verificationStatus`; `GET/PATCH /organizations/me` resolve the org by `organizations.userId` from the token, `404` when no row exists
- [x] 3.5 Register `OrganizationsModule` (with both schemas via `MongooseModule.forFeature`, exported for S15/S17 and seed reuse) in `AppModule`

## 4. Tests

- [x] 4.1 Unit: slug generation + E11000 collision retry on the registration seam (mocked duplicate-key → `-1` suffix); dispatch on `user.role` delegates to inert for `volunteer`/`admin` and creates the org row for `organization`
- [x] 4.2 Unit: verification state machine — `rejected→pending` allowed via `StatusTransitionService`, `pending→verified`/`pending→rejected` not callable in this module, `verified` submission → `ORG_ALREADY_VERIFIED`, pending-document update keeps `pending`
- [x] 4.3 E2E: register an organization → `/organizations/me` exists (slug present, `pending`); `POST /organizations/me/verification` with well-formed ObjectId docs → `pending`; `GET /organizations/me/verification` returns the latest status; unverified-email org → 403 `EMAIL_NOT_VERIFIED`; a `volunteer` account → 404/403 on `/organizations/me`
- [x] 4.4 E2E public behavior: `GET /organizations` and `GET /organizations/:slug` return 404/empty while `pending`; after setting a row to `verified` + `active` directly in the test they list and read; `GET /organizations/:slug/opportunities` returns `[]` for a verified+active org and 404 otherwise
- [x] 4.5 E2E registration regression: a `volunteer` registration still creates no `organizations` row (seam delegates), and `PATCH /organizations/me` cannot set `slug`/`verificationStatus` (400 via `forbidNonWhitelisted`)
- [x] 4.6 Run `npm run build && npm run lint && npm test && npm run test:e2e` from `/backend` until all green. Caveat: the only failing suites are `volunteers.service.spec.ts` and `volunteers.e2e-spec.ts` — in-flight work of the parallel Session 4 (untracked, its own logic; independent of this change's seam which rides the same dispatcher). All `organizations`, `auth`, `transactions`, `jobs`, `reference-data`, `app` and status-core tests pass.

## 5. Verification and commit

- [x] 5.1 From the repo root run `openspec validate organizations` and `openspec status --change organizations` (all artifacts done)
- [x] 5.2 Archive: `openspec archive organizations -y`, then commit locally only with message `feat(organizations): one-account org pages and verification document flow` (never push)