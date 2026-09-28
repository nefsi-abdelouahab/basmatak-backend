## ADDED Requirements

### Requirement: Load-tolerant windows for the create-publish flow

The `org-opportunities` create-publish e2e SHALL allow up to 120s per test and
poll the post-create navigation and post-publish notice for up to 20s, so that
the suite stays green when the shared dev server is loaded by parallel workers.

#### Scenario: Create-publish passes under parallel load

- **WHEN** the full e2e suite runs on 4 workers with a loaded dev server
- **THEN** the create-publish test creates, navigates, publishes, and asserts
  the notice within its windows on every viewport and locale
