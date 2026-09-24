## MODIFIED Requirements

### Requirement: Organization verifications collection
The system SHALL provide an `organization_verifications` collection with `organizationId`, `status` (`pending | verified | rejected`), `documents` (array of `mediaId`s stored as ObjectId-format strings), `rejectionReason` (optional), `assignedAdminId` (optional ObjectId of an `admin`-role user, unset by default), `submittedAt`, `decidedAt` (optional), and `decidedBy` (optional). Index SHALL be `(organizationId, status)` plus `(assignedAdminId, status)`.

#### Scenario: Submission record created
- **WHEN** an organization submits verification documents
- **THEN** an `organization_verifications` row is created with the documents, status `pending`, no `assignedAdminId`, and `submittedAt` set

#### Scenario: Rejection context retained
- **WHEN** an organization's submission is rejected by an admin (Session 15)
- **THEN** the row records `status=rejected`, `rejectionReason`, `decidedAt`, and `decidedBy`

#### Scenario: Assignment recorded
- **WHEN** an admin assigns a verification row to an existing admin user
- **THEN** the row records `assignedAdminId` without changing `status` or decision fields
