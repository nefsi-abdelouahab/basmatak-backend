## MODIFIED Requirements

### Requirement: Media ownership seam
The system SHALL provide a `MediaOwnership` check helper that validates a value is a well-formed ObjectId (Session 1 checker), upgraded this session (Session 8 retrofit of F9) into `MediaOwnership.assertFor(mediaId, actor, purpose)` which validates existence (not deleted), ownership, and `purpose`, surfacing `404`/`403`/business errors on failure. The checker calls in the volunteer avatar/banner route, the organization logo route, and the organization verification-documents route SHALL use the real assertion. Extension routes in later sessions (e.g. submission evidence) SHALL consume the same `assertFor` helper.

#### Scenario: ObjectId format check
- **WHEN** a `mediaId`-shaped value is passed through the helper
- **THEN** the helper confirms it is valid ObjectId format

#### Scenario: Real assertion resolves owned media
- **WHEN** `assertFor` is called with media owned by the actor, with the matching purpose, and not deleted
- **THEN** it returns the media row

#### Scenario: Real assertion rejects invalid media
- **WHEN** `assertFor` is called with absent, deleted, foreign, or wrong-purpose media
- **THEN** it fails with the appropriate `404`/`403`/business error

#### Scenario: Invited routes consume the assertion
- **WHEN** the volunteer avatar/banner, organization logo, and organization verification-documents routes receive a mediaId
- **THEN** they route it through `MediaOwnership.assertFor` and reject invalid media
- **AND** later sessions' evidence routes can consume the same helper without changing it