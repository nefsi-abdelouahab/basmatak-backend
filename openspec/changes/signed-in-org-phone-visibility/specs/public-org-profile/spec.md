## MODIFIED Requirements

### Requirement: Neutral publisher sidebar
The system SHALL render the org sidebar with neutral contact (address/phone/website/coordinates from the profile payload) and `ORG-<registryId>` only — National Registry IDs, supervisory-authority lines, audit records, maps beyond coordinates, and “Civic Mandates” labels SHALL NOT render; focus areas render from localized `focusDisciplines[]` names under a neutral label. For eligible signed-in viewers, the phone SHALL render with a `tel:` link only when the backend returns `contact.phone`. For guests, the phone SHALL be replaced by a translated “Sign in to view contact details” prompt linking to sign-in; no phone digits SHALL appear in the DOM. The client SHALL NOT receive-and-hide a phone: guest rendering SHALL follow the backend's omission of `contact.phone`.

#### Scenario: Signed-in viewer sees phone link
- **WHEN** an eligible authenticated viewer opens the public org profile and the payload contains `contact.phone`
- **THEN** the phone displays as a `tel:` link using the canonical `+213…` value

#### Scenario: Guest sees sign-in prompt instead of phone
- **WHEN** a guest opens the public org profile and the payload omits `contact.phone`
- **THEN** the sidebar shows the translated sign-in prompt for contact details and no phone number or `tel:` link exists

#### Scenario: Signed-in viewer without a dedicated phone sees no prompt
- **WHEN** an eligible signed-in viewer opens a profile whose payload omits `contact.phone`
- **THEN** no phone and no guest sign-in prompt render

#### Scenario: Sidebar carries no authority or audit copy
- **WHEN** the org profile renders
- **THEN** no registry/authority/audit/supervisory text exists in the sidebar DOM or catalogs

## ADDED Requirements

### Requirement: Session-aware public org profile query
The public organization profile query SHALL include the viewer's authentication state in its cache key and SHALL refetch after sign-in/sign-out, so contact visibility and the owner “Manage” affordance update without a manual reload.

#### Scenario: Sign-in refreshes contact access
- **WHEN** a guest signs in while viewing a public org profile
- **THEN** the profile query refetches with the session and the phone contact replaces the sign-in prompt when the backend returns it

#### Scenario: Sign-out removes phone access
- **WHEN** a signed-in viewer signs out on the public org profile
- **THEN** the query refetches as a guest and the phone is removed from the DOM

### Requirement: Public org e2e fixtures match the privacy contract
The public-orgs Playwright fixtures SHALL model the real payloads: the guest fixture SHALL omit `contact.phone`, and the signed-in fixture SHALL include it. Assertions SHALL verify the guest prompt and the signed-in `tel:` link without relying on patient-side masking.

#### Scenario: Guest fixture has no phone
- **WHEN** the guest profile test runs
- **THEN** the mocked guest payload has no `phone` key and the test asserts the sign-in prompt plus the absence of a `tel:` link

#### Scenario: Signed-in fixture has a phone
- **WHEN** the signed-in profile test runs
- **THEN** the mocked payload includes `contact.phone` and the test asserts the rendered `tel:` link
