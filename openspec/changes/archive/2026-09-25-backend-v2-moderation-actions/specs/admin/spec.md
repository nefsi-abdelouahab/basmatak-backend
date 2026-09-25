## MODIFIED Requirements

### Requirement: Admin report resolution
The system SHALL expose `PATCH /admin/reports/:reportId` (admin) accepting `{ status, resolution?, action? }` where `status` is one of `in_review | resolved | dismissed`. The change SHALL be validated through `StatusTransitionService.assert` for entity type `report` (whitelist `open → in_review | resolved | dismissed`, `in_review → resolved | dismissed`), writing a `status_histories` row. An absent report SHALL return `404`; a no-op or illegal transition SHALL return `409 INVALID_STATUS_TRANSITION`. An optional `resolution` note SHALL be stored on the row when provided. An optional `action` envelope `{ type, payload? }` (types `unpublish_opportunity | close_opportunity | suspend_target | notice`, neutral vocabulary, validated by DTO whitelist) SHALL extend the call into an atomic composite executed by the moderation-actions capability: with `action` present, `status` MUST be `resolved` and `resolution` MUST be present (the reason, propagated to every consequence history row); the report transition plus the consequence SHALL commit in one Mongo transaction or roll back together. Every `resolved` call (with or without `action`) SHALL execute through the composite so the suspend-on-report policy default applies; without `action` and with the flag off the observable outcome is identical to the plain path. `in_review`/`dismissed` calls without `action` use the plain path exactly as before.

#### Scenario: Move a report to resolved with a note
- **WHEN** an admin resolves an `open` or `in_review` report with `{ status: 'resolved', resolution: '...' }`
- **THEN** the report status becomes `resolved`, the `resolution` text is stored, and a `status_histories` row records the transition

#### Scenario: Move a report to in_review
- **WHEN** an admin sets an `open` report to `in_review`
- **THEN** the report status becomes `in_review` with a history row

#### Scenario: Unknown report 404
- **WHEN** an admin targets an id with no matching report
- **THEN** the response is `404`

#### Scenario: Illegal or no-op transition rejected
- **WHEN** an admin attempts `resolved → open`, `dismissed → in_review`, or a status equal to the current one
- **THEN** the response is `409 INVALID_STATUS_TRANSITION` and no history row is written

#### Scenario: Resolve with consequence applies atomically
- **WHEN** an admin resolves an `open` report with `{ status: 'resolved', resolution: '...', action: { type: 'unpublish_opportunity' } }` on a `published` opportunity target
- **THEN** the report becomes `resolved` and the opportunity becomes `closed` in one transaction, each with a `status_histories` row carrying the resolution as reason

#### Scenario: Action without reason rejected
- **WHEN** an admin sends an `action` envelope without `resolution`
- **THEN** the response is `400` and nothing is persisted
