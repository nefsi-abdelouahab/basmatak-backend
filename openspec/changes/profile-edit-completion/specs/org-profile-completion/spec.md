## MODIFIED Requirements

### Requirement: Complete-profile fact form bound to org endpoints
The system SHALL render the `org/complete-profile` onboarding wrapper around the shared organization profile form, bound to `GET /organizations/me` and persisted via `PATCH /organizations/me`: name (ar/fr), description, type, registrationNumber, location (localized wilaya select from `GET /locations/wilayas` + municipality select from `GET /locations/wilayas/:wilayaId/municipalities` + address), website, foundedYear, contact (email, optional phone), focusDisciplines (localized multi-select from `GET /skill-categories`), operatingScope, logo (purpose `organization_logo`), cover (purpose `organization_cover`), and the optional annual-report document link. The form SHALL contain no statute/legal fields and SHALL NOT duplicate validation or field logic from `org/profile`.

#### Scenario: Complete profile reaches checklist 100%
- **WHEN** an org fills every required fact field with valid values and submits
- **THEN** the system PATCHes `/organizations/me` and `GET /organizations/me/profile-completion` returns `{percent: 100, missingFields: [], complete: true}`.

#### Scenario: Municipality requires its wilaya
- **WHEN** the org picks a municipality
- **THEN** the municipality options come from the selected wilaya's endpoint and submit without a wilaya is blocked (backend `INVALID_LOCATION`).

#### Scenario: Focus disciplines are chosen from labels
- **WHEN** the org edits focus disciplines
- **THEN** it selects localized category names and the form submits the corresponding category ids, never free-typed ObjectIds.

### Requirement: Completion checklist display and math
The system SHALL display the profile-completion checklist from `GET /organizations/me/profile-completion` (`{percent, missingFields, complete}`) using the backend weights: name 10, description 15, type 5, registrationNumber 10, location 10, website 5, foundedYear 5, contact 10, focusDisciplines 10, operatingScope 5, logoMediaId 5, coverMediaId 10. The page SHALL show the percent and translated labels for every `missingFields` key, compute nothing client-side, and use the same value on `org/profile` and `org/complete-profile`.

#### Scenario: Partial profile shows missing fields
- **WHEN** the checklist returns a partial payload
- **THEN** the UI renders the authoritative percent and names each missing field from `missingFields` in the active locale.

#### Scenario: Complete profile reports full
- **WHEN** every weighted key is filled
- **THEN** the checklist returns `{percent: 100, missingFields: [], complete: true}` and the UI shows the completed state.

### Requirement: Phone and website validation
Organization phone inputs SHALL accept Algerian formats: local `0XXXXXXXXX`, international `+213XXXXXXXXX`, or `00213XXXXXXXXX`, ignoring spaces, dashes, dots, and parentheses. The frontend SHALL normalize accepted values to canonical `+213XXXXXXXXX` before PATCH and the backend SHALL validate and store that canonical form. Website inputs SHALL accept http/https URLs; invalid phone or website values SHALL be rejected client-side with a translated message before any PATCH.

#### Scenario: Local Algerian phone is normalized
- **WHEN** the org enters `0555 12 34 56`
- **THEN** submit sends `+213555123456` and the saved contact phone renders in canonical form.

#### Scenario: International Algerian phone is accepted
- **WHEN** the org enters `+213 555 12 34 56` or `00213555123456`
- **THEN** the value is accepted and stored as `+213555123456`.

#### Scenario: Invalid phone blocked
- **WHEN** the org enters letters, an unsupported country code, or an invalid Algerian length
- **THEN** the system blocks submit with a validation message and sends no PATCH.
