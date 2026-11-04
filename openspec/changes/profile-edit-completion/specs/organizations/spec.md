## MODIFIED Requirements

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId` and the additive fact-sheet fields `location`, `website`, `type`, `registrationNumber`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `annualReportMediaId`, plus `aggregates` supplied by the `OrgPublicStatsProvider` seam. The route SHALL optionally authenticate the caller. For authenticated callers, `contact.phone` SHALL be the canonical organization phone, falling back to the owning account's phone when the organization field is empty. For guests, `contact.phone` SHALL be `null` while email and every other public fact remain available. Organizations with `publicProfile.enabled=false` SHALL return `404` (the toggle is the public-page visibility gate).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier, the fact-sheet fields, and the `aggregates` block

#### Scenario: Guest phone is withheld
- **WHEN** a guest reads a public organization whose contact phone is set
- **THEN** the payload returns `contact.phone: null` and no phone digits appear in the response

#### Scenario: Signed-in phone is returned
- **WHEN** an authenticated caller reads the same organization
- **THEN** the payload returns the canonical `+213…` contact phone

#### Scenario: Account phone fallback
- **WHEN** the organization has no `contact.phone` but the owning account has a phone
- **THEN** an authenticated caller receives the account phone as `contact.phone`

#### Scenario: Non-verified or hidden organization is not readable
- **WHEN** a guest calls `GET /organizations/:slug` for a pending/rejected/inactive organization, or one with `publicProfile.enabled=false`
- **THEN** the response is `404`

### Requirement: Update own organization
The system SHALL expose `PATCH /organizations/me` (authenticated, organization role) allowing the caller to update editable fields of their own organization: `nameAr`, `nameFr`, `description`, `logoMediaId`, `coverMediaId`, `type`, `registrationNumber`, `location {wilayaId, municipalityId, address}`, `website`, `foundedYear`, `contact {email, phone}`, `focusDisciplines[]`, `operatingScope`, `publicProfile {enabled}`, and `annualReportMediaId`. `userId`, `slug`, `registryId`, `verificationStatus`, and `status` SHALL NOT be settable from the body. `logoMediaId` SHALL be validated through `MediaOwnership.assertFor` with `purpose=organization_logo`; `coverMediaId` with `purpose=organization_cover`; `annualReportMediaId` with `purpose=organization_document`. `website` SHALL be rejected unless it is an `http(s)` URL. `contact.phone` SHALL be optional, SHALL accept Algerian local/international formats, and SHALL be stored normalized to `+213XXXXXXXXX`. `location` refs SHALL reference seeded wilaya/municipality data (`INVALID_LOCATION`) and `focusDisciplines` SHALL reference existing skill categories (`INVALID_FOCUS_DISCIPLINE`).

#### Scenario: Owner updates fact-sheet fields
- **WHEN** an organization-role account patches `type`, `registrationNumber`, `location`, `website`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `publicProfile`, `coverMediaId`, `logoMediaId`, or `annualReportMediaId`
- **THEN** the fields are updated and the updated organization is returned

#### Scenario: Protected fields rejected
- **WHEN** a payload attempts to set `slug`, `registryId`, `verificationStatus`, `status`, or `userId`
- **THEN** the request is rejected by DTO validation

#### Scenario: Phone is stored canonically
- **WHEN** an organization patches `contact.phone` with `0555123456`, `+213 555 12 34 56`, or `00213555123456`
- **THEN** the stored and returned phone is `+213555123456`

#### Scenario: Invalid phone rejected
- **WHEN** an organization patches a phone containing letters, a non-Algerian country code, or an invalid length
- **THEN** DTO validation rejects the request with `400`

#### Scenario: Foreign, absent, or deleted media rejected
- **WHEN** an organization patches a `logoMediaId`, `coverMediaId`, or `annualReportMediaId` that is not theirs, does not exist, is soft-deleted, or has another purpose
- **THEN** the request is rejected via `MediaOwnership.assertFor`

### Requirement: Organization profile completion
The system SHALL expose `GET /organizations/me/profile-completion` (authenticated, organization role) returning `{ percent, missingFields[], complete }` with weighted keys: `name` 10, `description` 15, `type` 5, `registrationNumber` 10, `location` 10, `website` 5, `foundedYear` 5, `contact` 10 (email or phone), `focusDisciplines` 10, `operatingScope` 5, `logoMediaId` 5, `coverMediaId` 10. `percent` SHALL be the weighted share rounded to an integer 0–100, `missingFields` SHALL list only unfilled keys, and `complete` SHALL be true only when `missingFields` is empty. Profile completion SHALL be a single-PATCH flow; the route only reads the checklist.

#### Scenario: Checklist reflects missing facts
- **WHEN** an organization with only `nameFr` and `contact` set calls the route
- **THEN** `missingFields` lists every other key and `percent` equals the weighted share

#### Scenario: Complete profile reports full
- **WHEN** an organization with all weighted keys filled calls the route
- **THEN** `percent` is `100`, `missingFields` is empty, and `complete` is `true`

#### Scenario: Weights sum to 100
- **WHEN** every weighted key is filled
- **THEN** the weighted values sum to exactly 100

#### Scenario: Non-organization isolated
- **WHEN** a volunteer or an account without an organization row calls the route
- **THEN** the response is `404` in the error envelope

### Requirement: Organization registration hook
The system SHALL create the `organizations` row during organization registration: the `RegistrationExtrasService` seam dispatch on `user.role` SHALL, for role `organization`, create an `organizations` row linked by `organizations.userId = user.id` with a server-generated `slug` and `verificationStatus=pending`; for every other role it SHALL delegate to the inert default. When the registering account has a phone, the new organization SHALL store it as `contact.phone` in canonical `+213XXXXXXXXX` form.

#### Scenario: Organization registration creates org page
- **WHEN** a user registers with role `organization`
- **THEN** a `users` row and an `organizations` row (same `userId`, generated `slug`, `pending`) are both created

#### Scenario: Registration copies the account phone
- **WHEN** an organization registers with a valid phone
- **THEN** the created organization row carries the same phone in canonical form

#### Scenario: No phone leaves contact empty
- **WHEN** an organization registers without a phone
- **THEN** the organization row is created with no contact phone

#### Scenario: Other roles unchanged
- **WHEN** a user registers with role `volunteer` (or `admin`)
- **THEN** the seam delegates to the inert default and no `organizations` row is created
