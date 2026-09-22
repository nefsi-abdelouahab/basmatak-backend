## ADDED Requirements

### Requirement: Media collection
The system SHALL provide a `media` collection storing metadata only (file bytes are stored in object storage via the `StorageProvider`; nothing but metadata is written to MongoDB). The schema SHALL include `ownerId` (ObjectId), `purpose` (enum: `avatar | organization_logo | verification_document | submission_evidence | portfolio_item`), `visibility` (enum: `public | private`), `type` (`file | link`), `storageKey` (unique, for `file` media), `filename`, `mimeType`, `size`, `url` (for `link` media), and optional `submissionId`/`portfolioItemId` references, plus `deletedAt` (optional, soft-delete marker) and timestamps. Indexes SHALL include unique `storageKey`, `ownerId`, `submissionId`, and `portfolioItemId`.

#### Scenario: Metadata only in MongoDB
- **WHEN** a file upload is registered
- **THEN** no file bytes are stored in MongoDB and the row carries only metadata plus a `storageKey` referencing object storage

#### Scenario: Unique storage key
- **WHEN** a second `media` row attempts the same `storageKey`
- **THEN** the unique index rejects the insert

#### Scenario: Typed purpose and visibility
- **WHEN** a `media` row is created
- **THEN** `purpose` is one of the defined `MediaPurpose` values and `visibility` one of the defined `MediaVisibility` values

#### Scenario: Soft-delete marker
- **WHEN** media is deleted
- **THEN** the row keeps a `deletedAt` timestamp and remains present for audit purposes

### Requirement: Upload intent
The system SHALL expose `POST /media/uploads` (authenticated) accepting `{ filename, mimeType, size, purpose, visibility }` and returning `{ mediaId, uploadUrl }` where `uploadUrl` is a presigned upload URL (or the fake signed URL under the local provider). The request SHALL be rejected with `400` when the mime/size combination is outside the allowlist: images `image/jpeg`, `image/png`, `image/webp` ≤ 5 MB and documents `application/pdf` ≤ 5 MB; anything else is rejected. The body `size` is advisory only (the truth is re-read at confirm — F17). The caller becomes the `ownerId`.

#### Scenario: Valid image upload intent
- **WHEN** an authenticated user posts a `purpose` of `submission_evidence` with an allowed image mime and size ≤ 5 MB
- **THEN** a `media` row (`type=file`, status not deleted) is created and the response is `{ mediaId, uploadUrl }`

#### Scenario: Disallowed mime rejected
- **WHEN** the mime type is outside images/pdfs (e.g. a video or `.exe`)
- **THEN** the request fails with `400` and no `media` row is created

#### Scenario: Oversized upload rejected
- **WHEN** the advisory `size` exceeds the 5 MB limit for its mime
- **THEN** the request fails with `400`

### Requirement: Confirm upload
The system SHALL expose `POST /media/:mediaId/confirm` (authenticated, owner only) that marks the upload complete and SHALL re-read the actual `size`/`mimeType` from the storage provider via the service role; a mismatch against the declared values SHALL reject the request (F17). Only the owner may confirm; a foreign or absent mediaId SHALL fail with `404`.

#### Scenario: Owner confirms matching metadata
- **WHEN** the owner calls confirm and the provider reports the same mime/size as declared
- **THEN** the media is marked confirmed and returned

#### Scenario: Metadata mismatch rejected
- **WHEN** the provider reports a size or mime type that differs from the declared values
- **THEN** the request fails (business error) and the media is not confirmed

#### Scenario: Non-owner cannot confirm
- **WHEN** a user who is not the `ownerId` calls confirm
- **THEN** the response is `404`

### Requirement: External link media
The system SHALL expose `POST /media/links` (authenticated) accepting `{ url, purpose, visibility }`, creating a `media` row with `type=link` and the given `url`. The host SHALL be validated against an allowlist (`youtube.com`, `youtu.be`, `drive.google.com`); any other host SHALL be rejected with `400`. The caller becomes the `ownerId`.

#### Scenario: Allowed host accepted
- **WHEN** an authenticated user registers a `youtube.com` (or `youtu.be` / `drive.google.com`) link
- **THEN** a `media` row with `type=link` is created

#### Scenario: Disallowed host rejected
- **WHEN** the URL host is not in the allowlist
- **THEN** the request fails with `400`

### Requirement: Read media
The system SHALL expose `GET /media/:mediaId` (authenticated) returning the media metadata and, for `type=file`, a signed URL. Unauthenticated callers SHALL receive `404` (media is not discoverable by guests). `visibility=public` media SHALL be readable by any authenticated actor. `visibility=private` media SHALL be readable only by the owner, an admin, or the organization that owns the opportunity the media is attached to (per the §6 matrix); anyone else SHALL receive `403`. Deleted media SHALL NOT be returned.

#### Scenario: Public media readable by any authenticated user
- **WHEN** an authenticated actor reads public media
- **THEN** the metadata and a signed URL are returned

#### Scenario: Guest gets 404
- **WHEN** an unauthenticated caller reads any media
- **THEN** the response is `404`

#### Scenario: Private media owner read
- **WHEN** the owner reads their own private media
- **THEN** a signed URL is returned

#### Scenario: Private media stranger blocked
- **WHEN** an authenticated stranger (not owner, not admin, not the owning org) reads private media
- **THEN** the response is `403`

#### Scenario: Owning organization read
- **WHEN** the organization that owns the opportunity the media is attached to reads private media
- **THEN** a signed URL is returned

#### Scenario: Deleted media hidden
- **WHEN** an authorized caller reads soft-deleted media
- **THEN** the response is `404`

### Requirement: Delete media
The system SHALL expose `DELETE /media/:mediaId` (authenticated, owner only) performing a soft delete via `deletedAt`. Deletion SHALL be blocked when the media is referenced by a verified experience or by any submission not in a terminal state (`rejected`/`withdrawn`) — F6; the request SHALL then fail with a business error (`409`). A non-owner SHALL receive `404`; already-deleted media SHALL resolve to `404`.

#### Scenario: Owner deletes unattached media
- **WHEN** the owner deletes media not attached to a verified experience or a live submission
- **THEN** the row is soft-deleted (`deletedAt` set) and hidden from reads

#### Scenario: Verified-experience-attached media protected
- **WHEN** the owner deletes media referenced by a verified experience
- **THEN** the delete fails with `409`

#### Scenario: Live submission evidence protected
- **WHEN** the owner deletes media referenced by a submission still in `draft`/`submitted`/`under_review`/`approved`
- **THEN** the delete fails with `409`

#### Scenario: Terminal submission evidence deletable
- **WHEN** the owner deletes media referenced only by a `rejected` submission
- **THEN** the media is soft-deleted

#### Scenario: Non-owner cannot delete
- **WHEN** a user who is not the `ownerId` attempts delete
- **THEN** the response is `404`

### Requirement: Media read matrix helper
The system SHALL provide a `canReadMedia(actor, media)` helper that encodes the §6 private-media access matrix: allowed for the owner, an admin, or (for media attached to a submission of an opportunity) the organization owning that opportunity; public-visibility media readable by any authenticated actor; deleted media never readable. The helper SHALL be the single source of truth for read authorization on media.

#### Scenario: Matrix decides owner read
- **WHEN** the helper is invoked with the media owner
- **THEN** it grants read for both `public` and `private` media

#### Scenario: Matrix decides org-of-opportunity read
- **WHEN** the helper is invoked with the organization that owns the opportunity the media's submission belongs to
- **THEN** it grants read of private media

#### Scenario: Matrix denies stranger read
- **WHEN** the helper is invoked with an unrelated authenticated actor for `private` media
- **THEN** it denies read

#### Scenario: Matrix respects public visibility
- **WHEN** the helper is invoked with any authenticated actor for `public` media
- **THEN** it grants read

### Requirement: Storage provider interface
The system SHALL define a `StorageProvider` interface with `createPresignedUpload(storageKey, mimeType)` returning a presigned upload URL, `objectMetadata(storageKey)` returning the stored object's actual mime/size (service-role metadata read), and `createSignedReadUrl(storageKey)` returning a signed read URL. Implementations SHALL include `SupabaseStorageProvider` (default, via `@supabase/supabase-js`) and `LocalStorageProvider` (dev-only when `STORAGE_PROVIDER=local`, writing to a gitignored `./storage` directory with fake signed URLs), plus a test double usable by tests with no external credentials.

#### Scenario: Provider chosen by env
- **WHEN** `STORAGE_PROVIDER=local`
- **THEN** the `LocalStorageProvider` serves the interface
- **AND** when `STORAGE_PROVIDER=supabase` (or unset) the `SupabaseStorageProvider` serves the interface

#### Scenario: Local provider never needs credentials
- **WHEN** tests run without Supabase configuration
- **THEN** the local provider (or test double) satisfies all interface methods without network access

#### Scenario: Presigned flow shape
- **WHEN** an upload is registered
- **THEN** the provider yields a writable upload URL and, at confirm, the actual stored mime/size from object metadata

### Requirement: Media ownership assertion helper
The system SHALL expose `MediaOwnership.assertFor(mediaId, actor, purpose)` (consumed by invited sessions' routes) that resolves the media row and validates existence (not deleted), ownership by `actor`, and the media's `purpose`; any failure SHALL surface as a `404`/`403`/business error so callers rarely branch. Version 1 exists as an ObjectId-format checker seam (`MediaOwnership`); this session provides the real assertion helper.

#### Scenario: Exists and owned and purpose matches
- **WHEN** `assertFor` is called with an existing, non-deleted media owned by the actor with the matching purpose
- **THEN** it resolves successfully and returns the media

#### Scenario: Absent or deleted media fails
- **WHEN** the media does not exist or is soft-deleted
- **THEN** the assertion fails with `404`

#### Scenario: Foreign media fails
- **WHEN** the media exists but is owned by someone else
- **THEN** the assertion fails (ownership error)

#### Scenario: Purpose mismatch fails
- **WHEN** the media's purpose differs from the requested purpose
- **THEN** the assertion fails (purpose error)