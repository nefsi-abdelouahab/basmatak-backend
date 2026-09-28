# landing-structural-fidelity Specification

## Purpose
TBD - created by archiving change frontend-fix-design-fidelity. Update Purpose after archive.
## Requirements
### Requirement: Per-section structural comparison
The system SHALL provide a Playwright harness that loads the original `code.html` via `file://` and the built landing route at 1440x900 and, per section root, compares counts of `h1`/`h2`/`h3`, buttons, links, cards, and images, printing a text table of differences and failing on any difference outside the recorded allowed list.

#### Scenario: Section counts match or explain
- **WHEN** the harness runs against the built `/en` route
- **THEN** every section row prints expected vs actual counts and only rows in the allowed-difference list (copy swaps, real-data substitutions) may differ.

### Requirement: Computed-style and box comparison
The system SHALL extend the harness to compare per-section computed `font-family`, `font-size`, `font-weight`, `color`, `background-color`, `border-radius`, `padding`, `gap` and main-container bounding-box `width`/`height` between `code.html` and the built route, printing the values side by side in the same text table.

#### Scenario: Style table is reviewable
- **WHEN** the harness finishes the style pass
- **THEN** the printed table shows property, `code.html` value, route value, and match status for each section, and the run fails when an unlisted mismatch remains.

### Requirement: Allowed differences plus optional pixel signal
The system SHALL record the final allowed differences explicitly (neutralized forbidden copy, API-driven titles/counts/dates, placeholder avatars/images, locale strings) and SHALL treat an optional pixelmatch screenshot percentage as a printed secondary signal that never gates acceptance.

#### Scenario: Only allowed differences remain
- **WHEN** the owner reviews the final table
- **THEN** every remaining difference appears in the allowed list with its reason, and any pixelmatch value is labeled informational only.

