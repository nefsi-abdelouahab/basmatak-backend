## 1. Media schema and enums

- [x] 1.1 Create `backend/src/media/schemas/media.schema.ts`: `ownerId`, `purpose`, `visibility`, `type`, `storageKey`, `filename`, `mimeType`, `size`, `url`, `submissionId?`, `portfolioItemId?`, `confirmedAt?`, `deletedAt?`, timestamps; enums `MediaPurpose { avatar, organization_logo, verification_document, submission_evidence, portfolio_item }`, `MediaVisibility { public, private }`, `MediaType { file, link }`; unique sparse `storageKey` + indexes `ownerId`, `submissionId`, `portfolioItemId`
- [x] 1.2 Define shared `MediaPurpose`/`MediaVisibility`/`MediaType` constants/enums in a place reachable by DTOs and the schema (e.g. `media.constants.ts`)
- [x] 1.3 Register the `media` model via `MongooseModule.forFeature` in `CommonModule` (for `MediaOwnership`) and in the new `MediaModule`

## 2. Storage provider

- [x] 2.1 Create `backend/src/media/storage/storage-provider.interface.ts`: `createPresignedUpload`, `objectMetadata`, `createSignedReadUrl`
- [x] 2.2 Implement `SupabaseStorageProvider` (`@supabase/supabase-js`; presigned upload via storage from URL, service-role metadata read, signed read URL) using `SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_BUCKET`
- [x] 2.3 Implement `LocalStorageProvider` (`STORAGE_PROVIDER=local`, dev-only; writes to gitignored `./storage`, reads real bytes for `objectMetadata`, fake signed read URL)
- [x] 2.4 Add a factory for the `STORAGE_PROVIDER` token (`supabase` default, `local` dev) and a `TestStorageProvider` double with spies for unit tests — factory falls back to local (never crashes a bare env) and fail-fasts only on explicit `STORAGE_PROVIDER=supabase` without creds
- [x] 2.5 `npm i @supabase/supabase-js`; document the five env vars (`.env.example`) and gitignore `./storage` — added `STORAGE_LOCAL_DIR` + `./storage` ignore + env docs

## 3. Media service + help-ers

- [x] 3.1 Upgrade `backend/src/common/seams/media-ownership.ts` in place: inject `MediaModel`, keep `isValidIdFormat`, add `assertFor(mediaId, actor, purpose?)` — absent AND foreign both read as `404` (resource hidden, per §6 and design D5), `409` purpose mismatch
- [x] 3.2 Add the pure host-allowlist validator `assertAllowedLinkHost(url)` (http/https only; `youtube.com`, `youtu.be`, `drive.google.com` + subdomains; else `LINK_HOST_NOT_ALLOWED`)
- [x] 3.3 Add `canReadMedia(actor, media)` implementing the §6 matrix (public→any auth; private→owner/admin/org-of-opportunity via the `OpportunityMediaAccess` seam default = deny; guest/deleted→404)
- [x] 3.4 Add the `OpportunityMediaAccess` inert seam (default denies) for the org-of-opportunity read branch, wired for S10
- [x] 3.5 Add the `MediaDeletionPolicy` conservative default (any `submissionId`/`portfolioItemId` reference blocks deletion with `MEDIA_DELETION_BLOCKED`), upgradable by S10/S11
- [x] 3.6 Implement `MediaService`: `createUploadIntent` (allowlist size/mime, mint `storageKey`, return `{ mediaId, uploadUrl }`), `confirm`, `createLink`, `read` (uses `canRead`), `softDelete` (owner + deletion policy)

## 4. Controller, routes, DTOs

- [x] 4.1 Create `PostUploadMediaDto` (`filename`, `mimeType`, `size`, `purpose`, `visibility`), `PostLinkMediaDto` (`url`, `purpose`, `visibility`) with class-validator whitelist/forbidNonWhitelisted — `confirm` needs no body DTO (mediaId is a path param)
- [x] 4.2 Implement `MediaController` with the routes: `POST /media/uploads`, `POST /media/:mediaId/confirm`, `POST /media/links`, `GET /media/:mediaId` (`@Public` + `OptionalJwtAuthGuard`), `DELETE /media/:mediaId`
- [x] 4.3 Apply `@Throttle` on `POST /media/uploads` and `POST /media/links` (20/min each) and confirm (60/min)
- [x] 4.4 Register `MediaModule` additively in `backend/src/app.module.ts` (re-read the file first; two lines only, matching existing style, sibling lines preserved)

## 5. F9 retrofit

- [x] 5.1 `PATCH /volunteers/me`: route `avatar` through `MediaOwnership.assertFor(mediaId, caller, 'avatar')` and `banner` through `assertFor(mediaId, caller)` in the volunteers service; keep DTO ObjectId validation first
- [x] 5.2 `PATCH /organizations/me`: route `logoMediaId` through `assertFor(mediaId, org, 'organization_logo')`
- [x] 5.3 `POST /organizations/me/verification`: validate every `documents` mediaId via `assertFor(mediaId, org, 'verification_document')`, failing fast on the first invalid entry

## 6. Unit tests

- [x] 6.1 Unit: purpose/size/mime validation (allowed jpeg/png/webp/pdf ≤5 MB; anything else or oversized → 400) — `media.constants.spec.ts` + DTO-level `VALIDATION_ERROR` path pinned in e2e
- [x] 6.2 Unit: host allowlist (youtube.com/youtu.be/drive.google.com + subdomains accepted; other hosts and non-http URLs rejected)
- [x] 6.3 Unit: `canReadMedia` matrix (owner, public/any auth, admin, org-of-opportunity seam, stranger → denied, deleted → denied)
- [x] 6.4 Unit: confirm-mismatch rejects (provider metadata differs → `MEDIA_METADATA_MISMATCH`)
- [x] 6.5 Unit: deletion policy (unattached deletable; `submissionId`/`portfolioItemId`-attached blocked)
- [x] 6.6 Unit: `MediaOwnership.assertFor` (exists+owned+purpose ok; absent/foreign→404; wrong purpose→409) — via `media.service.spec.ts` + service-level F9 tests in volunteers/organizations specs

## 7. E2E tests

- [x] 7.1 Create `backend/test/media.e2e-spec.ts`: upload → confirm → owned signed `GET /media/:mediaId` (double injected via `STORAGE_PROVIDER` override)
- [x] 7.2 E2E: stranger `GET` private media → 403; public-visibility media readable by every authenticated role; guest → 404
- [x] 7.3 E2E: `DELETE` blocked for `submissionId`-attached media → 409; unattached deleted soft (idempotent 404 on second read)
- [x] 7.4 E2E: `/media/links` accepted for allowlisted hosts and rejected otherwise (400)
- [x] 7.5 E2E regression (F9): avatar and org-document routes reject foreign/absent/wrong-purpose mediaIds; own matching mediaIds accepted (volunteers + organizations e2e retrofitted to real uploads)

## 8. Verification and wrap-up

- [x] 8.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — build/lint/unit clean; e2e 9/10 suites green; `opportunities.e2e-spec.ts` fails 2 tests for the S7 `task_participants` unique `applicationId` index vs S6 raw `applicationId: null` seeds — sibling/finding to leave untouched (note for integration)
- [x] 8.2 From the repo root: `openspec validate media` and `openspec status --change media`
- [x] 8.3 `openspec archive media -y`
- [x] 8.4 `git add` selectively (backend/src/media/**, backend/test/media.e2e-spec.ts, retrofit deltas in backend/src/volunteers/** and backend/src/organizations/**, backend/src/app.module.ts, openspec specs + archive artifacts); never `git add -A`; commit `feat(media): storage provider, presigned uploads, links, visibility and ownership`