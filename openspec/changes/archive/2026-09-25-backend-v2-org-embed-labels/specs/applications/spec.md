## ADDED Requirements

### Requirement: Display-name joins on application reads
The system SHALL enrich `GET /applications/me` items, `GET /applications/:id` and `GET /opportunities/:id/applications` items with `volunteer {username, fullName, avatarMediaId}`, `organization {id, slug, nameFr, nameAr}`, `opportunity {id, title, slug}` and `position {id, title}`, resolved with batched per-page queries. For decided applications the payload SHALL include `decidedBy {userId, displayName}` naming the accepting/rejecting actor. Existing fields (`message`, `status`, `reason`) SHALL be unchanged.

#### Scenario: Volunteer reads own applications with names
- **WHEN** a volunteer with applications across two orgs reads `GET /applications/me`
- **THEN** every item carries the volunteer summary, org/opp/position names and, for decided rows, the decision actor name

#### Scenario: Org reads per-opportunity applications with volunteer names
- **WHEN** an org reads `GET /opportunities/:id/applications` for an owned opportunity
- **THEN** every item carries the applicant's username/full name plus org/opp/position names

### Requirement: Filled application inbox joiner
The system SHALL replace the inert `ApplicationInboxJoiner` with a real implementation that enriches `GET /organizations/me/applications` rows with the same volunteer/org/opp/position joins as above (plus `decidedBy` where decided), preserving cursor pagination (`total`/`page`/`pages`) and strict org scoping. The applications module SHALL keep consuming the seam token unchanged.

#### Scenario: Aggregate inbox returns joined names
- **WHEN** an org with applications across two of its opportunities reads the aggregate inbox
- **THEN** every row carries volunteer/org/opp/position display names, totals and paging match the un-enriched query, and no other org's rows appear

#### Scenario: Inbox search still resolves by joined titles
- **WHEN** an org queries the inbox with `?q=` matching an opportunity title
- **THEN** matching rows return with their joins populated
