## ADDED Requirements

### Requirement: Skill categories collection
The system SHALL provide a `skill_categories` collection with `slug` (unique), `nameAr`, `nameFr`, `order`, and `active` (default `true`). Indexes SHALL be a unique index on `slug` and an index on `order`.

#### Scenario: Category slug uniqueness enforced
- **WHEN** two `skill_categories` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

### Requirement: Skills collection
The system SHALL provide a `skills` collection with `slug` (unique), `categoryId`, `nameAr`, `nameFr`, `order`, and `active` (default `true`). Indexes SHALL be a unique index on `slug` and an index on `categoryId`.

#### Scenario: Skill slug uniqueness enforced
- **WHEN** two `skills` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

### Requirement: Read active skill categories
The system SHALL expose public `GET /skill-categories` returning only categories with `active: true`, ordered ascending by `order`, each with `id`, `slug`, `nameAr`, `nameFr`, and `order`. The response SHALL be cacheable via a `Cache-Control` header.

#### Scenario: Guest lists active categories ordered
- **WHEN** a guest calls `GET /skill-categories` after the seed has run
- **THEN** only `active` categories are returned in ascending `order`

#### Scenario: Deactivated category hidden
- **WHEN** a category has `active: false`
- **THEN** it is absent from `GET /skill-categories`

### Requirement: Read skills
The system SHALL expose public `GET /skills` returning only skills with `active: true`. The endpoint SHALL accept an optional `categoryId` query filter (skills of that category only) and an optional `q` query filter (case-insensitive match on the skill name). The response SHALL be ordered ascending by `order`, then `nameFr`. A guest SHALL be able to call it without authentication.

#### Scenario: Filter by category
- **WHEN** a guest calls `GET /skills?categoryId=<id>`
- **THEN** only active skills of that category are returned

#### Scenario: Query by text
- **WHEN** a guest calls `GET /skills?q=premiers`
- **THEN** only active skills whose name matches `premiers` (case-insensitive) are returned

### Requirement: Admin skill maintenance
The system SHALL require the `admin` role for `POST`/`PATCH` on `/admin/skill-categories(/:id)` and `/admin/skills(/:id)`. `POST` SHALL create the row with a generated unique `slug`, rejecting a duplicate `slug` with `409`. `PATCH` SHALL update editable fields including toggling `active`. Skills/categories SHALL be deactivated rather than deleted (no DELETE routes). Requests without the `admin` role SHALL be rejected with `403`.

#### Scenario: Admin creates and updates a category
- **WHEN** an admin calls `POST /admin/skill-categories` with a valid payload
- **THEN** the category is created with a generated `slug`
- **AND** a subsequent `PATCH /admin/skill-categories/:id` can set `active: false`

#### Scenario: Duplicate slug rejected
- **WHEN** an admin creates a category whose generated `slug` collides with an existing row
- **THEN** the response is `409` unless a numeric-suffix retry succeeds (see slug requirement)

#### Scenario: Non-admin blocked
- **WHEN** a non-admin authenticated user calls `POST /admin/skills`
- **THEN** the response is `403`

#### Scenario: Deactivation hides from public reads
- **WHEN** an admin sets a skill's `active` to `false` via `PATCH /admin/skills/:id`
- **THEN** the skill is absent from the public `GET /skills` response

### Requirement: Skill slug generation
The system SHALL generate slugs for `skill_categories` and `skills` with the canonical slugify pipeline: the name is transliterated to ASCII, lowercased, whitespace replaced with hyphens, and non-alphanumeric characters removed. When the initial slug collides with an existing row (MongoDB `E11000` on the unique `slug` index), the pipeline SHALL retry with a numeric suffix (`-1`, `-2`, ...) until a unique slug is produced. This pipeline SHALL be implemented once in `src/common/` for reuse by later sessions.

#### Scenario: ASCII transliteration
- **WHEN** a skill name contains non-ASCII characters
- **THEN** the generated slug is the transliterated ASCII form

#### Scenario: Collision retry with numeric suffix
- **WHEN** the base slug already exists in the collection (first attempt raises `E11000`)
- **THEN** the pipeline retries and stores the slug with a `-1` (or higher) numeric suffix

### Requirement: Skill seed idempotency
The `seed:skills` script SHALL insert the A4 default category list (each with `nameAr`, `nameFr`, `order`, `active`) and a starter set of at least 3 skills per category via `bulkWrite` upserts keyed by `slug`. Running it a second time SHALL result in the same category and skill counts as the first run.

#### Scenario: Double run is stable
- **WHEN** `seed:skills` is run twice
- **THEN** the second run leaves the same category and skill counts as the first run

#### Scenario: Starter skills present
- **WHEN** `seed:skills` completes
- **THEN** every seeded category has at least 3 seeded skills