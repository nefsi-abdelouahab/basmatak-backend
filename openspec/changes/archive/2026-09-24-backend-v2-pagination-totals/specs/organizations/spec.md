## MODIFIED Requirements

### Requirement: Public organization listing
The system SHALL expose public `GET /organizations` returning organizations where `verificationStatus=verified` AND `status=active`, with the shared counted page metadata. It SHALL accept bounded `q` public search and the roadmap’s `page` parameter; the search SHALL not expose pending, rejected, inactive, or deleted organizations.

#### Scenario: Verified and active organizations listed
- **WHEN** a guest calls `GET /organizations`
- **THEN** the response contains only organizations that are both verified and active

#### Scenario: Public search and page narrow the list
- **WHEN** a guest calls `GET /organizations?q=...&page=...`
- **THEN** only verified, active organizations matching the bounded search are returned with their total, page, and pages metadata

#### Scenario: Pending or non-active hidden
- **WHEN** an organization is `pending`, `rejected`, or has `status` other than `active`
- **THEN** it is absent from `GET /organizations`
