## ADDED Requirements

### Requirement: Authoritative profile completion on the dashboard
The system SHALL return a `completion` object (`{percent, missingFields, complete}`) from `GET /api/v1/volunteers/me/dashboard`, derived by the same backend function that serves `GET /api/v1/volunteers/me/profile-completion`. Weights SHALL be name 10, headline 5, bio 15, birthDate 10, location 10, avatar 10, banner 5, skills 15, availability 10, availabilityNote 3, preferredDomains 4, geographicBase 3. The legacy `completionPercent` field SHALL remain equal to `completion.percent` for compatibility. The dashboard SHALL render the percent and SHALL NOT show a “complete your profile to reach 100%” prompt when `complete` is true.

#### Scenario: Dashboard completion matches the profile endpoint
- **WHEN** the dashboard and profile-completion endpoints are read for the same volunteer
- **THEN** `completion.percent`, `completion.missingFields`, and `completion.complete` are identical and `completionPercent` equals `completion.percent`.

#### Scenario: Missing fields drive the prompt
- **WHEN** `completion.complete` is false
- **THEN** the dashboard shows the percent and the localized missing-field list instead of a generic prompt.

#### Scenario: Complete dashboard state
- **WHEN** `completion.complete` is true
- **THEN** the dashboard shows a positive completion state and no “reach 100%” message.
