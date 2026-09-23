# audit-logging Specification

## Purpose
Audit logging: an `audit_logs` collection written by an interceptor for admin actions and sensitive organization/volunteer operations, browsable through the admin audit-logs endpoint with actor/entity/date filters.
## Requirements
### Requirement: Audit interceptor
The system SHALL provide an `AuditInterceptor` that writes `audit_logs` entries for: every admin action, and `PATCH`/`DELETE` requests on organization and volunteer resources.

#### Scenario: Admin action audited
- **WHEN** a request is identified as an admin action
- **THEN** an `audit_logs` document is written recording the actor, action, target entity type and id, and timestamp

#### Scenario: Sensitive org/volunteer mutation audited
- **WHEN** a `PATCH` or `DELETE` is issued on an organization or volunteer resource by any authenticated actor
- **THEN** an `audit_logs` document is written for that mutation

#### Scenario: Read-only public request not audited
- **WHEN** a public `GET` request reaches the application
- **THEN** no `audit_logs` document is written for it

### Requirement: Audit logs collection
The system SHALL define the `audit_logs` model with indexes on `(entityType, entityId)`, `actorId`, and `createdAt`.

#### Scenario: Indexes available
- **WHEN** audit logs are queried by entity, actor, or creation time
- **THEN** the corresponding indexes serve those queries

