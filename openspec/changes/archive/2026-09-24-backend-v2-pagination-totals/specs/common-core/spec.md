## MODIFIED Requirements

### Requirement: Cursor pagination helper
The system SHALL provide a `Paginated`/cursor helper that list endpoints use, with default limit 20 and a maximum limit of 50. Its `CursorPage` response SHALL include `items`, `nextCursor`, `limit`, and required `total`, `page`, and `pages` metadata. `total` SHALL count the same base filter as the returned list before the cursor constraint; `pages` SHALL be computed from that total and the effective limit; and `page` SHALL identify the current cursor page without replacing opaque cursor navigation. The helper SHALL provide one reusable counted-page execution path so S7-owned cursor lists do not each reimplement their count and page calculation.

#### Scenario: Default and max limits
- **WHEN** a list endpoint is called with a limit
- **THEN** a limit below 1 falls back to the default of 20
- **AND** a requested limit above 50 is capped at 50

#### Scenario: Counted cursor output shape
- **WHEN** a paginated list is returned
- **THEN** it includes the items, a `nextCursor` when more items exist, and no `nextCursor` otherwise
- **AND** it includes the required `total`, `page`, and `pages` for the same filtered collection

#### Scenario: Page-count calculation
- **WHEN** a filtered list has a total not evenly divisible by its effective limit
- **THEN** `pages` reflects the final partial page and `page` identifies the returned cursor page

#### Scenario: Count ignores only cursor position
- **WHEN** a client requests a later cursor page
- **THEN** `total` and `pages` still represent all rows matching the base filters rather than only rows after that cursor
