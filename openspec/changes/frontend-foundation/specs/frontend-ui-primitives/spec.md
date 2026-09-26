## ADDED Requirements

### Requirement: Shared UI primitive set

The system SHALL ship exactly one shared set of token-driven primitives in `components/ui/*` — button, input, select, checkbox, pill, card, table, pagination, empty-state, loader — so that later sessions consume (never duplicate) them.

#### Scenario: Primitives render from theme tokens

- **WHEN** each primitive renders in its default, disabled, and error variants
- **THEN** all colors/fonts/spacing resolve from the central theme with both locales, and no primitive hardcodes values or strings

### Requirement: Primitives are session-frozen

The system SHALL treat `components/ui/*` as frozen after F0: later sessions consume primitives as-is, and any unavoidable new shared piece is declared in that session's out-of-scope check and added by exactly one session.

#### Scenario: Later-session reuse without edits

- **WHEN** a later session needs a button/input/table/pagination/empty/loader pattern
- **THEN** it imports the F0 primitive unchanged, filing a declared exception only if a genuinely new shared piece is required
