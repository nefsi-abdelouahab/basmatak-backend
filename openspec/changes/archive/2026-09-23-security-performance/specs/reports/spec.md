# reports Specification Change

## Purpose

Session 19 reports hardening (ROADMAP lines 858+): `POST /reports` is a spam/abuse surface with no rate limit today. This change makes report submission throttle-protected with a stricter per-route limit than the global default.

## Requirements

## MODIFIED Requirements

### Requirement: User submits a report
The system SHALL expose `POST /reports` (authenticated, any logged-in role) accepting `{ targetType, targetId, reason, description? }` validated by DTO whitelist + forbidNonWhitelisted (typed `targetType` set, Mongo ObjectId `targetId`, non-empty `reason` ≤2000, `description` ≤4000). The route SHALL store the caller's user id as `reporterId` and return the created row with `status=open`. Missing required fields or an unknown `targetType` SHALL fail with `400`; unauthenticated callers receive `401`. The route SHALL apply a stricter per-route `@Throttle` override so report floods are rejected with `429` before the global default is reached.

#### Scenario: Any logged-in role reports
- **WHEN** a logged-in volunteer, organization, or admin calls `POST /reports` with a valid payload
- **THEN** a `reports` row is created with `reporterId` equal to the caller's user id and `status=open`

#### Scenario: Invalid payload rejected
- **WHEN** the payload has an unknown `targetType`, a malformed `targetId`, or an empty `reason`
- **THEN** the response is `400` and no report row is written

#### Scenario: Guest blocked
- **WHEN** an unauthenticated request calls `POST /reports`
- **THEN** the response is `401`

#### Scenario: Report spam rate-limited
- **WHEN** a caller exceeds the per-route limit for `POST /reports` within the TTL window
- **THEN** the response is `429` and no report row is written