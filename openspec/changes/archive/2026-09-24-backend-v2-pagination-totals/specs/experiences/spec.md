## MODIFIED Requirements

### Requirement: Volunteer lists own experiences
The system SHALL expose `GET /experiences/me` (authenticated, volunteer) returning only the caller's own experiences, newest-first, cursor-paginated per the S1 convention (default limit 20, max 50) with counted cursor-page metadata. It SHALL accept optional `categoryId`, `skillId`, `from`, and `to` filters; the date range SHALL apply to the experience list’s timestamps. Each returned row SHALL carry its `registryId`. No other volunteer's rows SHALL appear regardless of pagination depth.

#### Scenario: Own experiences listed
- **WHEN** an authenticated volunteer requests `GET /experiences/me`
- **THEN** only rows with `volunteerId` equal to the caller are returned, ordered newest-first, paginated by the cursor convention, each including its `EXP-` registry identifier

#### Scenario: Category, skill, and date filters narrow own rows
- **WHEN** a volunteer supplies `categoryId`, `skillId`, `from`, or `to`
- **THEN** only their experiences matching every supplied filter are returned and the total reflects those filters
