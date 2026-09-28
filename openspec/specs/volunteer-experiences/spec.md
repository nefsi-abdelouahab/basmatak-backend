# volunteer-experiences Specification

## Purpose
TBD - created by archiving change frontend-volunteer-credentials. Update Purpose after archive.
## Requirements
### Requirement: Own enriched experience list with filters
The system SHALL render the volunteer own experience list from GET /api/v1/experiences/me with query filters categoryId, skillId, from, to. Each record SHALL show verified-by organization display name (nameFr or nameAr by locale, slug fallback) plus verified date from verifiedAt (ISO string) plus inline verificationCode plus EXP-registryId from registryId. Durations SHALL come from the real numeric duration field (minutes). Evidence SHALL be images, PDF, or link only with no audio player. The Audited 100 percent label SHALL NOT appear.

#### Scenario: Enriched list loads
- **WHEN** a volunteer opens volunteer/experiences
- **THEN** records populate from GET /experiences/me and each verified record shows verified-by org plus date plus inline code plus EXP-registryId, all in en plus ar.

#### Scenario: Filters narrow the list via query params
- **WHEN** a volunteer sets category, skill, or date filters
- **THEN** the list refetches with the matching categoryId, skillId, from, to params and result counts derive from the page payload.

#### Scenario: No audio evidence rendered
- **WHEN** a record carries link or file evidence
- **THEN** only image, PDF, or link affordances render and no audio player element exists in the DOM.

### Requirement: Experience detail read
The system SHALL render one experience record from GET /api/v1/experiences/:experienceId with the same enriched fields as the list plus attestation and visibility actions.

#### Scenario: Detail renders enriched record
- **WHEN** a volunteer opens an experience detail
- **THEN** fields populate from GET /experiences/:experienceId with verified-by organization display name plus date plus inline code plus EXP-registryId.

### Requirement: Experience visibility toggle
The system SHALL persist per-record visibility via PATCH /api/v1/experiences/:experienceId/visibility and reflect the server state after reload.

#### Scenario: Toggle persists across reload
- **WHEN** a volunteer flips a record visibility toggle
- **THEN** PATCH /experiences/:experienceId/visibility persists it and the toggle matches the server on reload.

### Requirement: Attestation download via shared blob helper
The system SHALL download attestations via GET /api/v1/experiences/:experienceId/attestation through the single shared authed blob-download helper as an attachment with no navigation away from the page.

#### Scenario: Attestation downloads as file
- **WHEN** a volunteer clicks Download attestation
- **THEN** the blob helper streams the PDF with attachment disposition and the route does not change.

### Requirement: Own reviews read
The system SHALL render received public reviews read-only from GET /api/v1/volunteers/me/reviews with neutral copy and no reply or dispute actions.

#### Scenario: Reviews render read-only
- **WHEN** a volunteer opens the reviews block
- **THEN** items populate from GET /volunteers/me/reviews with no mutation affordance.

### Requirement: Share verify link copies inline code
The system SHALL offer a copy action that copies the inline verificationCode plus a deep-link target of the form /verify/:code without building any standalone verify page UI.

#### Scenario: Copy link copies inline code
- **WHEN** a volunteer clicks Copy verification link on a record
- **THEN** the clipboard receives the inline code plus deep link and a confirmation renders.

