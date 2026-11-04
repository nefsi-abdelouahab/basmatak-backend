## MODIFIED Requirements

### Requirement: Media collection
The system SHALL provide a `media` collection storing metadata only (file bytes are stored in object storage via the `StorageProvider`; nothing but metadata is written to MongoDB). The schema SHALL include `ownerId` (ObjectId), `purpose` (enum: `avatar | volunteer_banner | organization_logo | verification_document | submission_evidence | portfolio_item | opportunity_cover | organization_cover | organization_document`), `visibility` (enum: `public | private`), `type` (`file | link`), `storageKey` (unique, for `file` media), `filename`, `mimeType`, `size`, `url` (for `link` media), and optional `submissionId`/`portfolioItemId` references, plus `deletedAt` (optional, soft-delete marker) and timestamps. Indexes SHALL include unique `storageKey`, `ownerId`, `submissionId`, and `portfolioItemId`.

#### Scenario: Metadata only in MongoDB
- **WHEN** a file upload is registered
- **THEN** no file bytes are stored in MongoDB and the row carries only metadata plus a `storageKey` referencing object storage

#### Scenario: Unique storage key
- **WHEN** a second `media` row attempts the same `storageKey`
- **THEN** the unique index rejects the insert

#### Scenario: Typed purpose and visibility
- **WHEN** a `media` row is created
- **THEN** `purpose` is one of the defined `MediaPurpose` values (including `volunteer_banner`) and `visibility` one of the defined `MediaVisibility` values

#### Scenario: Soft-delete marker
- **WHEN** media is deleted
- **THEN** the row keeps a `deletedAt` timestamp and remains present for audit purposes

### Requirement: Media purpose documentation and consumers
The system SHALL document the media purposes and the field that consumes each: `avatar` ↔ `volunteer_profiles.avatar`; `volunteer_banner` ↔ `volunteer_profiles.banner`; `organization_logo` ↔ `organizations.logoMediaId`; `opportunity_cover` ↔ `opportunities.coverMediaId`; `organization_cover` ↔ `organizations.coverMediaId`; `organization_document` ↔ `organizations.annualReportMediaId`. This documentation SHALL live in the media docs alongside the existing purpose list.

#### Scenario: Volunteer banner documented with consumer
- **WHEN** a developer reads the media docs for `volunteer_banner`
- **THEN** the doc lists `volunteer_banner` and names its consumer field `volunteer_profiles.banner`

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
