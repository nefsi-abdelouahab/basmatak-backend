## MODIFIED Requirements

### Requirement: Organization fact header
The system SHALL render the public org fact header on `(public)/orgs/[slug]` from `GET /api/v1/organizations/:slug`, showing name, `ORG-<registryId>` display-only (never a route key), localized location labels, `website`, `foundedYear`, verification status, and neutral contact (`contact{}`, `website`, coordinates) — authority/audit/supervisory lines SHALL NOT render. Phone contact SHALL be returned only to authenticated viewers; guest payloads SHALL carry `contact.phone: null`.

#### Scenario: Fact header renders real facts with ORG display code
- **WHEN** a guest opens `(public)/orgs/[slug]`
- **THEN** the system requests `GET /api/v1/organizations/:slug` and renders name, `ORG-<registryId>`, location, website, founded year, verification status, and non-phone contact.

#### Scenario: Unknown slug renders 404 state
- **WHEN** `GET /api/v1/organizations/:slug` returns 404
- **THEN** the shared not-found state renders with no fact residue.

### Requirement: Neutral publisher sidebar
The system SHALL render the org sidebar with neutral contact (address/phone/website/coordinates from the profile payload) and `ORG-<registryId>` only — National Registry IDs, supervisory-authority lines, audit records, maps beyond coordinates, and “Civic Mandates” labels SHALL NOT render; focus areas render from localized `focusDisciplines[]` names under a neutral label. For authenticated viewers, the phone SHALL render with a `tel:` link. For guests, the phone SHALL be replaced by a translated “Sign in to view contact details” prompt linking to sign-in; no phone digits SHALL appear in the DOM or payload.

#### Scenario: Signed-in viewer sees phone link
- **WHEN** an authenticated volunteer or organization views the public org profile
- **THEN** the phone displays as a `tel:` link using the canonical `+213…` value.

#### Scenario: Guest sees sign-in prompt instead of phone
- **WHEN** a guest views the public org profile
- **THEN** the sidebar shows the translated sign-in prompt for contact details and no phone number or `tel:` link exists.

#### Scenario: Sidebar carries no authority or audit copy
- **WHEN** the org profile renders
- **THEN** no registry/authority/audit/supervisory text exists in the sidebar DOM or catalogs.

## ADDED Requirements

### Requirement: Session-aware public org profile query
The public organization profile query SHALL include the viewer's authentication state in its cache key and SHALL refetch after sign-in/sign-out, so contact visibility and the owner “Manage” affordance update without a manual reload.

#### Scenario: Sign-in refreshes contact access
- **WHEN** a guest signs in while viewing a public org profile
- **THEN** the profile query refetches with the session and the phone contact replaces the sign-in prompt.

#### Scenario: Sign-out removes phone access
- **WHEN** a signed-in viewer signs out on the public org profile
- **THEN** the query refetches as a guest and the phone is removed from the DOM.
