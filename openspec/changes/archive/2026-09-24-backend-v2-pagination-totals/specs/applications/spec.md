## MODIFIED Requirements

### Requirement: Volunteer lists and views own applications
The system SHALL expose `GET /applications/me` (authenticated, `volunteer`, own rows only) returning the caller's applications, optionally filtered by `status`, `from`, and `to`, with cursor pagination (default limit 20, max 50) and counted cursor-page metadata. The date range SHALL apply to the application list’s creation timestamps. It SHALL expose `GET /applications/:applicationId` to either the owning volunteer or an organization account that owns the opportunity the application belongs to; any other caller SHALL receive 404 (non-owner treated as not-found, per §6 visibility rules).

#### Scenario: Own applications listed
- **WHEN** a volunteer requests `GET /applications/me?status=pending`
- **THEN** only their own `pending` applications are returned, paginated by the cursor convention

#### Scenario: Date range narrows own applications
- **WHEN** a volunteer supplies `from` and/or `to`
- **THEN** only their applications within the requested creation-date range are returned and the total reflects that filter

#### Scenario: Foreign application is not visible
- **WHEN** a volunteer requests an application that belongs to another volunteer and is not the owning organization
- **THEN** the request is treated as not-found (404)

### Requirement: Organization aggregate application inbox
The system SHALL expose `GET /organizations/me/applications` (authenticated, organization role) returning the applications of the caller's own opportunities across all opportunities — the aggregate inbox for the org dashboard's "Recent applications" (RP §2.1#6). The query SHALL be scoped by the organization resolved from the JWT account (`organizations.userId → organizations._id`), so a non-owning org never observes another org's applications. Filters SHALL include `?status=` (validated against the application statuses), `?opportunityId=` (a single opportunity), and `?q=` (text search over the org's own opportunity and position titles; caller-name search is deferred to the Session 17 name join). A validated `sort` parameter from the inbox’s server-defined whitelist SHALL be supported. Rows SHALL be returned with cursor pagination (default limit 20, max 50), counted cursor-page metadata, and plain projections (the document's own fields — ids, status, `message`, `reason`, timestamps); name/entity embeds SHALL be provided by the `ApplicationInboxJoiner` seam. A volunteer caller SHALL receive 403.

#### Scenario: Inbox aggregates across opportunities
- **WHEN** an organization requests `GET /organizations/me/applications`
- **THEN** applications across all of its opportunities are returned with counted cursor pagination and plain, name-free rows

#### Scenario: Inbox filtered by status and opportunity
- **WHEN** the org requests `?status=under_review&opportunityId=...`
- **THEN** only matching rows of its own opportunities are returned

#### Scenario: Text search narrows to matching opportunities
- **WHEN** the org requests `?q=cleanup`
- **THEN** only applications whose opportunity or position title matches are returned (matched against the org's own opportunities)

#### Scenario: Sort values are validated
- **WHEN** the org requests an unlisted inbox `sort` value
- **THEN** validation rejects the request

#### Scenario: Foreign org applications never leak
- **WHEN** two organizations each have applications and one lists the inbox
- **THEN** the other organization's rows are absent regardless of pagination depth

#### Scenario: Volunteer cannot use the inbox
- **WHEN** a volunteer calls `GET /organizations/me/applications`
- **THEN** the response is 403
