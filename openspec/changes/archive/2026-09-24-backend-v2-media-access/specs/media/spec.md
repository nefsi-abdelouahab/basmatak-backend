## Modified `media` capability

### Requirement: Media collection

The system SHALL provide a `media` collection storing metadata only (file bytes are stored in object storage via the `StorageProvider`; nothing but metadata is written to MongoDB). The schema SHALL include `ownerId` (ObjectId), `purpose` (enum: `avatar | organization_logo | verification_document | submission_evidence | portfolio_item | opportunity_cover | organization_cover | organization_document`), `visibility` (enum: `public | private`), `type` (`file | link`), `storageKey` (unique, for `file` media), `filename`, `mimeType`, `size`, `url` (for `link` media), and optional `submissionId`/`portfolioItemId` references, plus `deletedAt` (optional, soft-delete marker) and timestamps. Indexes SHALL include unique `storageKey`, `ownerId`, `submissionId`, and `portfolioItemId`.

#### Scenario: Typed purpose and visibility

- **WHEN** a `media` row is created
- **THEN** `purpose` is one of the defined `MediaPurpose` values — including the three new values `opportunity_cover`, `organization_cover`, `organization_document` — and `visibility` one of the defined `MediaVisibility` values

### Requirement: Upload intent

The system SHALL expose `POST /media/uploads` (authenticated) accepting `{ filename, mimeType, size, purpose, visibility, submissionId? }` and returning `{ mediaId, uploadUrl }` where `uploadUrl` is a presigned upload URL (or the fake signed URL under the local provider). The request SHALL be rejected with `400` when the mime/size combination is outside the allowlist: images `image/jpeg`, `image/png`, `image/webp` ≤ 5 MB and documents `application/pdf` ≤ 5 MB; anything else is rejected. The request SHALL be rejected with `400` when `purpose` is not in the allowlist, which SHALL include the three new purposes for any authenticated user. Submission-evidence uploads (and only those) SHALL default `visibility=private` when `visibility` is omitted; all other purposes keep `public` as the default. The caller becomes the `ownerId`. The body `size` is advisory only (the truth is re-read at confirm — F17).

#### Scenario: Valid image upload intent

- **WHEN** an authenticated user posts a `purpose` of `submission_evidence` with an allowed image mime and size ≤ 5 MB and omits `visibility`
- **THEN** a `media` row (`type=file`, `visibility=private`, status not deleted) is created and the response is `{ mediaId, uploadUrl }`

#### Scenario: New cover/document purposes accepted

- **WHEN** an authenticated user posts a `purpose` of `opportunity_cover`, `organization_cover`, or `organization_document`
- **THEN** the request proceeds (the purpose is in the allowlist) and a `media` row is created with that purpose

#### Scenario: Disallowed mime rejected

- **WHEN** the mime type is outside images/pdfs (e.g. a video or `.exe`)
- **THEN** the request fails with `400` and no `media` row is created

#### Scenario: Oversized upload rejected

- **WHEN** the advisory `size` exceeds the 5 MB limit for its mime
- **THEN** the request fails with `400`

#### Scenario: Unknown purpose rejected

- **WHEN** `purpose` is not in the allowlist (including the three new ones)
- **THEN** the request fails with `400` (validation code `PURPOSE_NOT_ALLOWED`)

### Requirement: Read media

The system SHALL expose `GET /media/:mediaId` returning the media metadata and, for `type=file`, a signed URL, gated by the read matrix in `MediaAccessService.canRead` (§6). Guests SHALL read `visibility=public` media (no authentication required); any other read of private media SHALL be denied for guests (response `404` for absent/private-undeclared media, `403` for an authenticated non-owner with no org branch). An authenticated actor SHALL read `visibility=public` media. An admin SHALL read any media. The owner SHALL read their own media. The organization owning the opportunity SHALL read `visibility=private` `submission_evidence` attached to a submission on that opportunity (real org-read branch, restored — was an inert deny). Deleted media SHALL NOT be returned.

#### Scenario: Guest reads public media

- **WHEN** an unauthenticated guest reads `visibility=public` media
- **THEN** the metadata and a signed URL are returned (no auth challenge)

#### Scenario: Guest private media hidden

- **WHEN** an unauthenticated guest reads `visibility=private` media
- **THEN** the response is `404`

#### Scenario: Owner reads private media

- **WHEN** the `ownerId` of private media reads it
- **THEN** a signed URL is returned

#### Scenario: Org reads evidence on its opportunity

- **WHEN** an organization reads `visibility=private` `submission_evidence` attached to a submission on one of its own opportunities
- **THEN** a signed URL is returned

#### Scenario: Stranger blocked from private evidence

- **WHEN** an authenticated actor who is not the owner, not an admin, and not the opportunity's owning organization reads `visibility=private` `submission_evidence`
- **THEN** the response is `403`

#### Scenario: Deleted media hidden

- **WHEN** an authorized caller reads soft-deleted media
- **THEN** the response is `404`

### Requirement: Media ownership assertion helper

The system SHALL expose `MediaOwnership.assertFor(mediaId, actor, purpose)` that resolves the media row and validates existence (not deleted), ownership by `actor`, and the media's `purpose`; any failure SHALL surface as a `404`/`403`/business error so callers rarely branch. The accepted `purpose` parameter SHALL include the three new purposes.

## ADDED Requirements

### Requirement: Media purpose documentation and consumers

The system SHALL document the three new media purposes and the field that consumes each: `opportunity_cover` ↔ consumed by the `coverMediaId` field on `opportunity` documents; `organization_cover` ↔ consumed by the `coverMediaId` field on `organization` documents; `organization_document` ↔ consumed by the `annualReportMediaId` field on `organization` documents claims/opportunities (annual report attachment). This documentation SHALL live in the media docs alongside the existing purpose list.

#### Scenario: Opportunity cover documented with consumer

- **WHEN** a developer reads the media docs for `opportunity_cover`
- **THEN** the doc lists `opportunity_cover` and names its consumer field `opportunities.coverMediaId`

#### Scenario: Organization cover documented with consumer

- **WHEN** a developer reads the media docs for `organization_cover`
- **THEN** the doc lists `organization_cover` and names its consumer field `organizations.coverMediaId`

#### Scenario: Organization document documented with consumer

- **WHEN** a developer reads the media docs for `organization_document`
- **THEN** the doc lists `organization_document` and names its consumer field `organizations.annualReportMediaId`

#### Scenario: Private-by-default evidence documented

- **WHEN** a developer reads the media docs for `submission_evidence`
- **THEN** the doc states that uploads default to `visibility=private` and that the owning organization may read private evidence attached to submissions on its own opportunities
