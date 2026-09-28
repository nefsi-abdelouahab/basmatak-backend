## MODIFIED Requirements

### Requirement: Base layout shell at three breakpoints
The system SHALL render public routes under a `(public)` layout (top navbar + footer, full-width sections in a `max-w-7xl` container, no sidebar and no bottom nav) and SHALL render authenticated screens only under the 3-column shell — navbar/sidebar per DESIGN.md with mobile bottom-nav — at Desktop ≥1280px (3-column), Tablet 1024–1279px (2-column), and Mobile ≤768px (single-column + bottom nav), per mandate RESPONSIVE.

#### Scenario: Public landing has no authenticated chrome
- **WHEN** a guest loads `/en` or `/ar` at 1440px
- **THEN** the top navbar and footer are visible and no sidebar or bottom-nav node exists in the DOM

#### Scenario: Shell renders at all viewports
- **WHEN** component tests render the authenticated shell at 1440/1100/390
- **THEN** navigation is reachable at each width (sidebar or bottom-nav as appropriate) with no overlap, no horizontal scroll, and desktop-first 1440px 3-column structure intact
