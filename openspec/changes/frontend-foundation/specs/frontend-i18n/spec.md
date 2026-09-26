## ADDED Requirements

### Requirement: Per-area message catalogs merged by config

The system SHALL organize translations as per-area files (`messages/<area>/en.json` + `messages/<area>/ar.json`, e.g. `messages/auth/en.json`, `messages/common/en.json`) merged by the next-intl configuration — per owner decision — so that sessions own disjoint key-prefix areas and never collide in one monolithic catalog.

#### Scenario: Both locales load per-area catalogs

- **WHEN** the app boots under `locale=en` and under `locale=ar`
- **THEN** every shipped area contributes its strings in the active locale with zero missing-key errors, and each session's keys live under its declared area prefix

### Requirement: No hardcoded UI strings in JSX

The system SHALL render no hardcoded user-facing string in JSX — all copy resolves through next-intl keys present in both `en` and `ar` catalogs — per mandate I18N (roadmap §2.2).

#### Scenario: Catalog coverage check

- **WHEN** the key-coverage audit runs over route and component sources
- **THEN** every user-facing literal is backed by an en+ar key pair, and any hardcoded JSX string fails the session

### Requirement: RTL correctness at locale=ar

The system SHALL mirror layout at `locale=ar` via logical CSS properties with the Arabic font swap, so that en↔ar locale switching mirrors the shell and system screens without overlap or clipping.

#### Scenario: Locale switch mirrors layout

- **WHEN** a Playwright test switches locale en↔ar on the shell and a system screen at viewports 1440/1100/390
- **THEN** layout mirrors (start/end flip), Arabic type renders in the Arabic font, and no horizontal overflow occurs
