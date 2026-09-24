# organizations Specification Delta

## MODIFIED Requirements

### Requirement: Organizations collection
The system SHALL provide an `organizations` collection with `userId` (ObjectId, unique — one organization per account per §9), `slug` (unique), `nameAr`/`nameFr`, `description`, `logoMediaId` (ObjectId-format optional, validated against `media` via `MediaOwnership.assertFor` with `purpose=organization_logo` — Session 8 retrofit of F9), `registryId` (a server-minted neutral registry identifier in `ORG-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `verificationStatus` (`pending | verified | rejected`, default `pending`), `status` (`active | suspended | deleted`, default `active`), and a `reliability` sub-document whose values are computed by the Session 13 trust layer and refreshed on submission events and the job tick. Indexes SHALL include unique `userId`, unique `slug`, and `(verificationStatus, status)`.

#### Scenario: One organization per account
- **WHEN** a second `organizations` row is inserted with the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Slug uniqueness enforced
- **WHEN** two `organizations` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

#### Scenario: Reliability recomputed and cached
- **WHEN** the reliability computation runs for an organization
- **THEN** the `organizations.reliability` sub-document stores the computed metrics with a `lastRefreshedAt` timestamp, replacing any placeholder values

#### Scenario: One registry identifier per organization
- **WHEN** an organization is created (or an existing row is backfilled)
- **THEN** the row carries a well-formed `ORG-` registry identifier minted by `RegistryIdService`, and the identifier is never client-settable or mutable afterwards

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId`.

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

### Requirement: Read own organization
The system SHALL expose `GET /organizations/me` (authenticated, organization role) returning the caller's own organization, resolved from the token's user via `organizations.userId`. The response SHALL include the organization's `registryId`. The route SHALL be declared before `/organizations/:slug` in the controller (§2.7 route-order trap).

#### Scenario: Owner reads their organization
- **WHEN** an `organization`-role account calls `GET /organizations/me`
- **THEN** its own organization record is returned, including its `ORG-` registry identifier

#### Scenario: Account without an organization
- **WHEN** a `volunteer` (or any account with no matching `organizations` row) calls `GET /organizations/me`
- **THEN** the response is `404` in the error envelope