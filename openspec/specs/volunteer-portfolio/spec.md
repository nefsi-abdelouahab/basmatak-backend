# volunteer-portfolio Specification

## Purpose
TBD - created by archiving change frontend-volunteer-credentials. Update Purpose after archive.
## Requirements
### Requirement: Own portfolio list read in stored order
The system SHALL render the volunteer own portfolio from GET /api/v1/portfolio/me in stored order ascending, showing title, description, typeLabel, tags, visibility, and media thumbnails. There is no single-item GET endpoint, so all reads and edits SHALL operate on list items.

#### Scenario: Ordered list loads with metadata
- **WHEN** a volunteer opens volunteer/portfolio
- **THEN** items populate from GET /portfolio/me in order ascending with typeLabel and tags visible per item.

#### Scenario: No single-item fetch attempted
- **WHEN** a volunteer edits any item
- **THEN** no single-item GET request is issued and the form binds to the list payload item.

### Requirement: Portfolio create with typeLabel and tags
The system SHALL create items via POST /api/v1/portfolio/me accepting title, description, mediaIds, visibility, typeLabel, and tags. File media SHALL attach only via the shared 2-step flow (POST /api/v1/media/uploads purpose portfolio_item, then PUT bytes, then POST /api/v1/media/:mediaId/confirm) limited to jpeg, png, webp, pdf at 5 MB max; link items SHALL be plain URLs; no audio player and no Featured flag SHALL exist.

#### Scenario: Create with metadata succeeds
- **WHEN** a volunteer submits a valid item with typeLabel and tags plus attached media
- **THEN** POST /portfolio/me creates it and the list refetches showing the new item with its metadata.

#### Scenario: Oversize or wrong-type file blocked before upload
- **WHEN** a file over 5 MB or outside jpeg, png, webp, pdf is selected
- **THEN** the flow is blocked with an error and no POST /media/uploads call is made.

### Requirement: Portfolio update including metadata and visibility
The system SHALL update items via PATCH /api/v1/portfolio/:itemId including typeLabel, tags, and visibility fields.

#### Scenario: Metadata edit persists
- **WHEN** a volunteer edits typeLabel, tags, or visibility and saves
- **THEN** PATCH /portfolio/:itemId persists the change and the list reflects it after refetch.

### Requirement: Portfolio delete with confirm
The system SHALL delete items via DELETE /api/v1/portfolio/:itemId only after an explicit confirm dialog, then refetch the list.

#### Scenario: Delete requires confirm
- **WHEN** delete is opened but not confirmed
- **THEN** no request is sent and the item remains listed.

#### Scenario: Confirmed delete removes item
- **WHEN** deletion is confirmed
- **THEN** DELETE /portfolio/:itemId succeeds and the item leaves the list after refetch.

### Requirement: Portfolio reorder as atomic batch
The system SHALL persist manual order via PUT /api/v1/portfolio/me/order as one atomic batch and render the new order after refetch.

#### Scenario: Reorder persists
- **WHEN** a volunteer moves items and saves the order
- **THEN** PUT /portfolio/me/order persists the full sequence and the list renders in the saved order after refetch.

