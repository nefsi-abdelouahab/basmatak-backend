## ADDED Requirements

### Requirement: Organization activity feed route
The system SHALL expose `GET /organizations/me/activity` for callers with the organization role, returning that organization's activity items newest-first as a `CursorPage` with populated `total`/`page`/`pages`.

#### Scenario: Org reads own activity
- **WHEN** an authenticated organization calls `GET /organizations/me/activity`
- **THEN** the system returns HTTP 200 with a `CursorPage` whose items all belong to that organization's opportunities and whose `total`/`page`/`pages` reflect the scoped result set

#### Scenario: Org feed requires organization role
- **WHEN** a guest, volunteer, or other organization's credential calls `GET /organizations/me/activity`
- **THEN** the system rejects with 401 for unauthenticated callers and 403/404 for callers that do not own an organization

### Requirement: Volunteer activity feed route
The system SHALL expose `GET /volunteers/me/activity` for callers with the volunteer role, returning that volunteer's activity items newest-first as a `CursorPage` with populated `total`/`page`/`pages`.

#### Scenario: Volunteer reads own activity
- **WHEN** an authenticated volunteer calls `GET /volunteers/me/activity`
- **THEN** the system returns HTTP 200 with a `CursorPage` whose items all belong to that volunteer and whose `total`/`page`/`pages` reflect the scoped result set

#### Scenario: Volunteer feed isolation
- **WHEN** a volunteer with no shared opportunities reads their feed
- **THEN** the system MUST NOT include items belonging to other volunteers or other organizations

### Requirement: Unified activity item shape
Every activity item SHALL have the shape `{ type, title, ts, entity: { type, id, name, slug?, summary } }` where `ts` is the event timestamp and `entity` carries a human-readable summary of the related record.

#### Scenario: Item shape contract
- **WHEN** any item is returned from either feed
- **THEN** it contains string `type`, string `title`, ISO datetime `ts`, and an `entity` object with string `type`, string `id`, string `name`, and string `summary` (plus optional string `slug` where the entity has one)

### Requirement: Org feed event coverage
The organization feed SHALL include publish, close, start-review (application and submission), and verification-decision events for the organization's own opportunities.

#### Scenario: Org lifecycle reflected
- **WHEN** an organization publishes an opportunity, starts a review, and verifies a submission
- **THEN** subsequent reads of `GET /organizations/me/activity` include one item per step in newest-first order

### Requirement: Volunteer feed event coverage
The volunteer feed SHALL include apply, accept, participation-start, verification-decision, and record-issuance events for the volunteer's own journey.

#### Scenario: Volunteer lifecycle reflected
- **WHEN** a volunteer applies, is accepted, starts, and is verified with an issued record
- **THEN** subsequent reads of `GET /volunteers/me/activity` include one item per step in newest-first order

### Requirement: Chronological merge ordering
The system SHALL merge `status_histories` and `notifications` sources into a single list ordered newest-first by event timestamp, with deterministic tie-breaking. No AI/ML or engagement ranking SHALL be applied.

#### Scenario: Newest-first merge
- **WHEN** events from both sources exist with distinct timestamps
- **THEN** the feed returns them sorted by `ts` descending with a stable tie-break, and the ordering rule is plain chronological only

### Requirement: Transactional dedupe
The system SHALL dedupe pairs where one domain event produced both a `status_histories` row and a `notifications` row inside the same transaction, so the event appears exactly once.

#### Scenario: No double-appear for transactional events
- **WHEN** an accept or verify transaction wrote both a history row and a notification for the same event instance
- **THEN** the feed contains a single item for that event

### Requirement: Entity summaries from lightweight reads
The system SHALL compose each item's `entity` summary from lightweight reads of the related record (opportunity title, organization name, volunteer name, submission state) without loading full documents or private media.

#### Scenario: Summary content
- **WHEN** a feed item references an opportunity, organization, volunteer, or submission
- **THEN** its `entity.name` and `entity.summary` reflect the current lightweight fields of that record and never expose private evidence URLs

### Requirement: Read-only computed aggregation
The feeds SHALL be computed reads over existing collections (`status_histories`, `notifications`, `applications`, `submissions`, `opportunities`, `organizations`, `volunteer_profiles`). The system SHALL create no new collection and perform no writes when serving a feed.

#### Scenario: No storage side effects
- **WHEN** either feed is read repeatedly
- **THEN** no new collection is created and no documents are written as a result of the reads
