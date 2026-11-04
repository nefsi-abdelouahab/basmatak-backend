## MODIFIED Requirements

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId` and the additive fact-sheet fields `location`, `website`, `type`, `registrationNumber`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `annualReportMediaId`, plus `aggregates` supplied by the `OrgPublicStatsProvider` seam (database-derived since Session 16 filled the real provider). Organizations with `publicProfile.enabled=false` SHALL still resolve (the toggle is a neutral platform-profile preference, not a visibility gate — no 404 regression). The `contact.phone` field SHALL be omitted entirely, not returned as `null` or a masked value, for guests and for viewers that are not a live, active account with a non-revoked, unexpired session. It SHALL be present only for an eligible viewer and SHALL carry only the dedicated organization contact phone. The owning account's phone SHALL NOT be used as a fallback. The public contact DTO SHALL mark `phone` optional. The endpoint SHALL return `Cache-Control: private, no-store` and SHALL append `Authorization` and `Cookie` to any existing `Vary` header via `res.vary()` without replacing existing CORS values.

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier, the fact-sheet fields, and the `aggregates` block

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

#### Scenario: Aggregates real after Session 16
- **WHEN** a guest reads the public profile of an org with 2 active initiatives, 1 completed initiative, 4 engaged volunteers, 300 verified minutes, and a cached `responseRate` of `0.5`
- **THEN** the `aggregates` block carries those database-derived values (not zeros) with `activeSince` mirroring `foundedYear`

#### Scenario: Guest payload omits the contact phone
- **WHEN** a guest without a bearer token calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the response is `200`, `contact.email` is unchanged, and `contact` has no `phone` key at all

#### Scenario: Eligible signed-in viewer receives the dedicated phone
- **WHEN** a live, active account with a non-revoked, unexpired session calls `GET /organizations/:slug`
- **THEN** `contact.phone` equals the dedicated organization contact phone

#### Scenario: Ineligible viewer is treated as a guest
- **WHEN** the caller's account is suspended or deleted, or the token's session is revoked, expired, or does not belong to the account
- **THEN** the response is `200` with no `contact.phone` key

#### Scenario: No owner-account phone fallback
- **WHEN** the organization has no dedicated contact phone but its owning account has a phone
- **THEN** `contact.phone` is absent from the public payload

#### Scenario: Contact cache headers preserve the CORS Vary
- **WHEN** the profile endpoint runs with an existing `Vary: Origin` header
- **THEN** `Vary` contains `Origin`, `Authorization`, and `Cookie`, and `Cache-Control` is `private, no-store`
