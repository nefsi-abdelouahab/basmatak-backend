## MODIFIED Requirements

### Requirement: Reports collection and module
The system SHALL provide a `reports` collection (inventory §2.19, §3, module 21) owned by a new `backend/src/reports/` module, with documents carrying `reporterId` (ObjectId of the submitting account), `targetType` (ObjectId-less label from the fixed set `opportunity | user | organization | review | submission`), `targetId` (ObjectId), `reason` (required, trimmed), `description` (optional), `title` (optional, trimmed, ≤200), `priority` (enum `low | normal | high`, default `normal`), `assignedAdminId` (optional ObjectId of an `admin`-role user), `status` (enum `open | in_review | resolved | dismissed`, default `open`), and optional `resolution`. Indexes SHALL include `(status, createdAt)` and `(targetType, targetId)` plus `(priority, status)` and `(assignedAdminId, status)`.

#### Scenario: Report structure stored
- **WHEN** a report is created
- **THEN** the `reports` document carries `reporterId`, `targetType`, `targetId`, `reason`, `status=open`, `priority=normal`, and timestamps, with the configured indexes available

#### Scenario: Reports module boots
- **WHEN** the application boots with this change
- **THEN** the `reports` Mongoose model is registered and the module registers the report status whitelist with the S1 `StatusTransitionService`

#### Scenario: Optional title and priority stored
- **WHEN** a report is created or triaged with `title` and `priority=high`
- **THEN** the row stores both within their length/enum bounds

#### Scenario: Assignment stored
- **WHEN** a report is assigned to an existing admin user
- **THEN** the row stores `assignedAdminId` referencing that admin
