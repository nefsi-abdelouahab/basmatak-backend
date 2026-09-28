## MODIFIED Requirements

### Requirement: Single centralized theme from DESIGN.md tokens
The system SHALL define all visual tokens once — primary `#6D28D9`, hover `#5B21B6`, surfaces (`#FFFFFF` cards on `#F8FAFC` canvas), ink `#111827` / muted `#64748B`, borders `#E2E8F0`/`#F1F5F9`, status green `#16A34A` / amber `#F59E0B` / error `#DC2626`, radii card 12px / input-button 8px / pill-chip 6px, full display-to-label type scale, hairline/raised/modal shadows — as CSS variables plus the Tailwind theme config derived from them, with Inter + IBM Plex Sans Arabic (weights 400/500/600) loaded via `next/font`, bound to the CSS variable consumed by `fontFamily.sans`, applied on `<body>` via `font-sans`, and swapped to Plex-first for `ar`, so that mandate THEME holds on every screen.

#### Scenario: Token values resolve from the central theme
- **WHEN** any component renders a primary button, a status pill, or body text
- **THEN** the computed color/font/spacing values originate from the central theme variables, and no hardcoded replacement exists in component or route code

#### Scenario: Body font resolves per locale
- **WHEN** Playwright loads `/en` and `/ar` and reads `getComputedStyle(document.body).fontFamily`
- **THEN** the `en` value contains Inter and the `ar` value contains IBM Plex Sans Arabic, with no serif fallback in either locale
