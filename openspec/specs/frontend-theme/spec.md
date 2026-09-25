# frontend-theme Specification

## Purpose
TBD - created by archiving change frontend-foundation. Update Purpose after archive.
## Requirements
### Requirement: Single centralized theme from DESIGN.md tokens

The system SHALL define all visual tokens once — primary `#6D28D9`, hover `#5B21B6`, surfaces, borders `#E2E8F0`/`#F1F5F9`, status green `#16A34A` / amber `#F59E0B` / error `#DC2626`, radii, type scale with IBM Plex Sans Arabic + Inter — as CSS variables plus the Tailwind theme config derived from them, so that mandate THEME (roadmap §2.1) holds on every screen.

#### Scenario: Token values resolve from the central theme

- **WHEN** any component renders a primary button, a status pill, or body text
- **THEN** the computed color/font/spacing values originate from the central theme variables, and no hardcoded replacement exists in component or route code

### Requirement: Zero hardcoded values outside theme

The system SHALL contain no hardcoded color, font, or spacing value in any component, page, or hook — everything reads from the central theme — enforced by a grep gate (`grep -rn "#[0-9a-fA-F]\{3,6\}" src/components src/app` empty outside `theme/`).

#### Scenario: Grep gate passes

- **WHEN** the grep gate runs over `src/components` and `src/app`
- **THEN** zero hex-color literals are found outside `src/theme`, and CI-equivalent verification fails the session otherwise

### Requirement: Status-color discipline

The system SHALL reserve green for verification states only and amber for pending states only, per `design/system-design.md` ("Disciplined Civic Network": no floating cards, gradients, or glassmorphism).

#### Scenario: Status pill audit

- **WHEN** success/pending/error pills render across shell and system screens
- **THEN** green appears only on verified/success states, amber only on pending states, and error red only on failure states

