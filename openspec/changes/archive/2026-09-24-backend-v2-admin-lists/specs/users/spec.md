## ADDED Requirements

### Requirement: User status change records reason
Suspending or reinstating a user account through the admin status route SHALL persist the optional caller-supplied `reason` (≤500) and `notes` (≤2000) on the written `status_histories` row, so the audit trail shows why the account state changed. Absent values SHALL leave those history fields unset; oversized values SHALL fail DTO validation (`400`) with no state change.

#### Scenario: Reason visible in history
- **WHEN** an admin suspends a user with a reason and notes
- **THEN** the history row for that transition carries both fields

#### Scenario: Oversized reason rejected
- **WHEN** an admin supplies a `reason` longer than 500 characters
- **THEN** the response is `400` and no status change or history row occurs
