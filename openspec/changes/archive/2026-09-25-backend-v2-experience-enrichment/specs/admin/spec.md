## MODIFIED Requirements

### Requirement: Admin volunteer experiences read
The system SHALL expose `GET /admin/volunteers/:volunteerId/experiences` (admin) returning that volunteer's verified-experience rows through the `AdminExperienceDisplay` seam, now bound to the real `experience-enrichment` provider (RP §3.2#9 "Latest Verified Engagement"). The response SHALL be a single newest-first counted page of enriched rows (`id`, `registryId`, `title`, `description`, `skills`, real `duration`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, `verificationCode`, `publicVisibility`, neutral `review { rating, notes } | null`), covering experiences of any `publicVisibility`. Unknown volunteers SHALL return `404`; non-admin callers SHALL receive `403`. The admin module's route and service code are unchanged — only the seam's DI binding is swapped.

#### Scenario: Real provider returns enriched rows
- **WHEN** an admin requests experiences for a volunteer with verified experiences after `experience-enrichment` ships
- **THEN** the response is a valid counted page with the enriched rows newest-first (no 500, no invented rows)

#### Scenario: Volunteer without experiences returns empty page
- **WHEN** an admin requests experiences for a known volunteer with no experiences
- **THEN** the response is a valid counted page with zero items

#### Scenario: Unknown volunteer 404
- **WHEN** an admin requests experiences for a nonexistent volunteer id
- **THEN** the response is `404`

#### Scenario: Non-admin rejected
- **WHEN** a volunteer or organization account requests the admin experiences route
- **THEN** the response is `403`
