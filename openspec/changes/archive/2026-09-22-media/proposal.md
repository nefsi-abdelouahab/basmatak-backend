## Why

Media is the backbone of the verification loop (org documents, submission evidence) and profile identity (avatars), yet there is no media module: sessions 4 and 5 already accept `mediaId`s that no one validates (F9), `purpose`/`visibility` are untyped and delete is only guarded for verified-experience-attached media (F6), and upload size/mime are never re-checked server-side (F17). Estimation and demonstration phases in front of the exacting client come into their own only when the media lifecycle is real, not stubbed.

## What Changes

- Add a `media` collection (metadata only — bytes live in object storage) with `ownerId`, `submissionId`, `portfolioItemId`, `storageKey`, and typed enums: `type: file|link`, `MediaPurpose { avatar, organization_logo, verification_document, submission_evidence, portfolio_item }`, `MediaVisibility { public, private }`, soft delete via `deletedAt`.
- Introduce a `StorageProvider` interface with `SupabaseStorageProvider` (default, presigned uploads, service-role metadata read) and `LocalStorageProvider` (`STORAGE_PROVIDER=local`, dev-only `./storage` gitignored, fake signed URLs), plus a test double.
- Add the six routes from inventory §2.11: `POST /media/uploads` (presigned intent), `POST /media/:mediaId/confirm` (owner; re-reads real size/mime and rejects mismatches — F17), `POST /media/links` (host allowlist: youtube.com, youtu.be, drive.google.com), `GET /media/:mediaId` (public 404 unless auth; private → signed URL only for owner / owning-opportunity org / admin per §6), `DELETE /media/:mediaId` (owner; soft; blocked for verified-experience-attached media or any submission not in a terminal state — F6), and the `canReadMedia(actor, media)` matrix helper.
- Retrofit the F9 seams so `PATCH /volunteers/me` (avatar/banner) and `POST /organizations/me/verification` (documents) validate `mediaId` existence, ownership, purpose, and non-deleted status via `MediaOwnership.assertFor`. Micro-refactor of those routes only.
- Env vars: `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`. New dependency `@supabase/supabase-js`.

Out of scope: video upload (links only), client-side image compression, portfolio-item linking (S14), frontend.

## Capabilities

### New Capabilities
- `media`: media lifecycle — presigned upload intent, confirm, external video links, visibility-gated reads, soft delete, `MediaOwnership`/`canReadMedia` guards over the `StorageProvider` interface.

### Modified Capabilities
- `volunteers`: `PATCH /volunteers/me` now asserts `avatar`/`banner` mediaIds against media (existence, ownership, not deleted) via `MediaOwnership.assertFor`, replacing the raw-ObjectId validation.
- `organizations`: `POST /organizations/me/verification` document `mediaId`s and `PATCH /organizations/me` `logoMediaId` are now validated against media (existence, ownership, purpose, not deleted) via `MediaOwnership.assertFor`, replacing the raw-ObjectId validation.

## Impact

- New module `backend/src/media/` (schema, provider interface + 3 providers, service, controller, DTOs, ownership helper), additive two-line registration in `backend/src/app.module.ts`.
- Retrofit edits inside `backend/src/volunteers/` and `backend/src/organizations/` services (already-committed sessions; changes are additive assertions).
- New E2E `backend/test/media.e2e-spec.ts`; unit tests for validation, allowlist, `canReadMedia` matrix, confirm-mismatch.
- `openspec/specs/media` + MODIFIED deltas for `volunteers`, `organizations`, `extension-seams`.
- No Mongo schema migration beyond a new collection; no byte ever stored in MongoDB.