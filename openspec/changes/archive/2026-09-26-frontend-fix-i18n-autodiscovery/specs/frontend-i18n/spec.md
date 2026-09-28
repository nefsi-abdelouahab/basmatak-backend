## MODIFIED Requirements

### Requirement: Per-area message catalogs merged by config

The system SHALL organize translations as per-area files (`messages/<area>/en.json` + `messages/<area>/ar.json`, e.g. `messages/auth/en.json`, `messages/common/en.json`) merged automatically by the next-intl configuration at build time — per owner decision — so that sessions own disjoint key-prefix areas and never collide in one monolithic catalog, and so that no session ever hand-edits the merge configuration: shipping the two locale files is sufficient for both locales to pick them up under the area key derived from the directory name (kebab-to-camelCase, e.g. `volunteer-account` becomes `volunteerAccount`).

#### Scenario: Both locales load per-area catalogs

- **WHEN** the app boots under `locale=en` and under `locale=ar`
- **THEN** every shipped area contributes its strings in the active locale with zero missing-key errors, and each session keys live under its declared area prefix

#### Scenario: New area needs no config edit

- **WHEN** a session ships a new `messages/<area>/en.json` + `messages/<area>/ar.json` pair without touching the merge configuration
- **THEN** both locales serve the new area keys with zero missing-key errors

#### Scenario: Unpaired locale file fails fast

- **WHEN** an area ships only one of `en.json` / `ar.json`
- **THEN** the configuration raises a descriptive error at build time instead of serving a silently incomplete catalog
