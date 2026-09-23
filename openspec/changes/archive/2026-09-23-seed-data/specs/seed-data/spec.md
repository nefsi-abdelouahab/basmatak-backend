## ADDED Requirements

### Requirement: Canonical location reference data
The system SHALL seed a complete Algerian administrative dataset: all 58 wilayas (codes 01–58) and all municipalities, each with `code`, `nameAr`, `nameFr`, and `parentCode` (for municipalities), sourced from the canonical `locations` payload. The seed MUST be idempotent: re-running it MUST NOT change record counts or create duplicates, keyed by unique code.

#### Scenario: Fresh database gets the full dataset
- **WHEN** the location seed runs against an empty database
- **THEN** exactly 58 wilayas and 1,541 municipalities exist, and every wilaya code from 01 to 58 is present exactly once with both `nameAr` and `nameFr`

#### Scenario: Re-running the location seed is stable
- **WHEN** the location seed runs a second time over an already-seeded database
- **THEN** the total record counts are unchanged and no duplicate codes exist

### Requirement: Canonical skill catalog from assumption A4
The system SHALL seed the A4 skill categories (each with canonical `slug`, `order`, `active`) and at least three starter skills per category (each with `slug` and bilingual names). The seed MUST be idempotent and MUST NOT re-activate categories or skills that an administrator deactivated.

#### Scenario: Fresh database gets the full catalog
- **WHEN** the skill seed runs against an empty database
- **THEN** all A4 categories exist with ordered `order` values and each category has at least three active starter skills

#### Scenario: Re-seeding preserves administrator deactivations
- **WHEN** an administrator deactivates a category or skill and the skill seed runs again
- **THEN** the deactivated entry stays deactivated after the re-seed

### Requirement: Admin account bootstrap
The system SHALL provide a seed script that creates a `users` row with role `admin` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and a documented dev-default fallback. Re-running the script MUST NOT reset an existing admin's password unless `SEED_ADMIN_RESET=true`.

#### Scenario: Fresh database creates the admin
- **WHEN** the admin seed runs against an empty database with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set
- **THEN** exactly one admin user exists with that email and the supplied password

#### Scenario: Existing admin password is preserved
- **WHEN** the admin seed re-runs against a database that already has an admin
- **THEN** the admin's password hash is unchanged

#### Scenario: Admin password reset is explicit
- **WHEN** the admin seed re-runs with `SEED_ADMIN_RESET=true`
- **THEN** the admin's password is updated to the newly supplied value

### Requirement: Verified demo organization bootstrap
The system SHALL provide a seed script that creates exactly one demo organization whose `verificationStatus` becomes `verified` through the same service path the admin approval flow uses (a real pending verification row created then approved — no orphan field writes). It MUST be idempotent by a stable email.

#### Scenario: Fresh database creates a verified demo organization
- **WHEN** the demo seed runs against an empty database
- **THEN** exactly one demo organization exists with `verificationStatus=verified` and the demo account email is registered

#### Scenario: Re-running the demo seed is stable
- **WHEN** the demo seed runs a second time
- **THEN** no duplicate demo organizations are created

### Requirement: Demo volunteer bootstrap
The system SHALL seed one demo volunteer account with a volunteer profile and at least one catalog skill linked to it. The seed MUST be idempotent by a stable email.

#### Scenario: Fresh database creates the demo volunteer
- **WHEN** the demo seed runs against an empty database
- **THEN** exactly one demo volunteer exists with a profile and at least one skill

#### Scenario: Re-running the demo volunteer seed is stable
- **WHEN** the demo seed runs a second time
- **THEN** no duplicate demo volunteer profiles or skills are created

### Requirement: Aggregate seed entry point
The system SHALL provide `seed:all` that runs the location, skill, admin, and demo seeds idempotently, plus individual npm scripts for each seed (`seed:locations`, `seed:skills`, `seed:admin`, `seed:demo`).

#### Scenario: seed:all on a fresh database
- **WHEN** `seed:all` runs against an empty database and the smoke check inspects the result
- **THEN** it yields 58 wilayas, the full municipality and category counts, one admin, one verified demo organization, and one demo volunteer

#### Scenario: seed:all twice is stable
- **WHEN** `seed:all` runs twice in a row
- **THEN** the second run does not change any record counts or introduce duplicates

### Requirement: F1 closure regression (admin login + verified publish)
The verified demo organization MUST be able to publish, and the seeded admin MUST be able to log in through the public auth route, proving the F1 dead-end is closed.

#### Scenario: Admin can log in
- **WHEN** the seeded admin's credentials are submitted to the login endpoint
- **THEN** login succeeds and returns an access token

#### Scenario: Verified demo organization can publish
- **WHEN** the verified demo organization's account creates an opportunity
- **THEN** the publish succeeds and the opportunity is visible as published