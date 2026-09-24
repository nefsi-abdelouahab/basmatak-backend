## MODIFIED Requirements

### Requirement: Canonical skill catalog from assumption A4
The system SHALL seed the confirmed skill categories (7 total, each with canonical `slug`, `order`, `active`) — `media-content`, `hosting-presenting`, `design`, `training-education`, `organization-logistics`, `environment-field`, and `other` — and at least three starter skills per category (each with `slug` and bilingual names). The seed MUST be idempotent and MUST NOT re-activate categories or skills that an administrator deactivated.

#### Scenario: Fresh database gets the full catalog
- **WHEN** the skill seed runs against an empty database
- **THEN** exactly the 7 confirmed categories exist with ordered `order` values and each category has at least three active starter skills

#### Scenario: Re-seeding preserves administrator deactivations
- **WHEN** an administrator deactivates a category or skill and the skill seed runs again
- **THEN** the deactivated entry stays deactivated after the re-seed

## ADDED Requirements

### Requirement: Idempotent catalog reseed (prune removed seed rows)
The system SHALL converge the `skill_categories` and `skills` collections onto the current seed catalog when the skill seed runs against a previously-seeded database: any seed row whose `slug` is no longer part of the catalog (e.g. rows from an older dataset version) SHALL be removed, and current seed rows SHALL be upserted. The prune SHALL run after the upserts so the freshly inserted catalog always survives, and it MUST be safe on an empty database (a no-op when nothing pre-exists).

#### Scenario: Previously-seeded database converges on the new catalog
- **WHEN** the skill seed runs against a database that still contains rows from an older skill catalog
- **THEN** the legacy rows are removed and only the current catalog rows remain, with no duplicates

#### Scenario: Prune is a no-op on an empty database
- **WHEN** the skill seed runs against an empty database
- **THEN** the prune removes nothing and only the current catalog rows are inserted