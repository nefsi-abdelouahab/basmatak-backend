# portfolio Specification

## Purpose
Portfolio: volunteer portfolio items with title, description, own-media attachments and per-item visibility, plus ordering and deletion; public portfolio surface only shows `public` items.
## Requirements
### Requirement: Portfolio items collection

The system SHALL provide a `portfolio_items` collection owned by the portfolio module (inventory §3, §2.15). Each document SHALL carry `volunteerId` (ObjectId, the owner; equals the account `sub` per the S7 participations convention), `title` (required, trimmed), `description` (optional, trimmed), `mediaIds` (array of ObjectId references to `media` rows, default `[]`), `visibility` (`public | private`, default `public`), `order` (Number), and timestamps via the S1 base options. Each document MAY additionally carry the optional metadata `typeLabel` (trimmed short text, maxlength 40, absent unless the owner set it) and `tags` (array of trimmed strings, default `[]`, at most 10 entries each of maxlength 30, stored deduped). Indexes SHALL include `(volunteerId, order)` per §3; the metadata fields receive no dedicated index.

#### Scenario: Portfolio item document shape

- **WHEN** a portfolio item is inserted
- **THEN** it carries `volunteerId`, `title`, `description`, `mediaIds`, `visibility`, and `order` with the documented defaults, plus `tags` defaulting to `[]` and no `typeLabel` unless one was supplied

#### Scenario: Metadata bounds enforced

- **WHEN** a `typeLabel` longer than 40 characters or a `tags` array with more than 10 entries or any entry longer than 30 characters is written
- **THEN** the write is rejected and the metadata is not persisted

#### Scenario: Volunteer order index

- **WHEN** the collection is queried by `(volunteerId, order)`
- **THEN** the `(volunteerId, order)` index serves the ordering reads

### Requirement: List own portfolio

The system SHALL expose `GET /portfolio/me` (authenticated, volunteer role) returning only the caller's own `portfolio_items` rows, ordered by `order` ascending, each including its media metadata and its metadata `typeLabel`/`tags`. No other volunteer's items SHALL appear.

#### Scenario: Own items ordered

- **WHEN** an authenticated volunteer calls `GET /portfolio/me`
- **THEN** only their own items are returned, sorted by `order` ascending

#### Scenario: Own view carries metadata

- **WHEN** an own item has `typeLabel`/`tags` set
- **THEN** the payload includes them, and an item without them returns `typeLabel: null` and `tags: []`

#### Scenario: No foreign items returned

- **WHEN** a volunteer requests their portfolio
- **THEN** no items owned by another volunteer appear in the response

### Requirement: Create portfolio item

The system SHALL expose `POST /portfolio/me` (authenticated, volunteer role) accepting `{ title, description?, mediaIds?, visibility?, typeLabel?, tags? }`. The item SHALL be created with `volunteerId` set to the caller and `order` appended after the volunteer's current maximum (`max + 1`, or `0` for the first item). Every `mediaId` SHALL be validated through `MediaOwnership.assertFor(mediaId, volunteerId, 'portfolio_item')` — absent, deleted, foreign, or wrong-purpose media SHALL be rejected. A media row already linked to a different portfolio item (`portfolioItemId` set to another item) SHALL be rejected with `409`. On success the referenced media rows SHALL have their `portfolioItemId` set to the new item's id. The optional `typeLabel` (maxlength 40) and `tags` (max 10 entries each maxlength 30, deduped) SHALL be persisted when supplied and SHALL default to absent/`[]` otherwise.

#### Scenario: Item appended at next order

- **WHEN** a volunteer creates a new item while owning items at `order` 0, 1, 2
- **THEN** the new item is created with `order` 3

#### Scenario: Media ownership and purpose enforced

- **WHEN** a volunteer creates an item whose media includes an absent, deleted, foreign, or non-`portfolio_item` purpose media row
- **THEN** the request is rejected via `MediaOwnership.assertFor` and no item is created

#### Scenario: Media linked to another item rejected

- **WHEN** a `mediaId` is already referenced by a different portfolio item
- **THEN** the request fails with `409` and no linkage changes occur

#### Scenario: Success links the media rows

- **WHEN** an item is created with valid media
- **THEN** each referenced `media` row's `portfolioItemId` is set to the new item

#### Scenario: Metadata persisted on create

- **WHEN** a volunteer creates an item with `typeLabel` and `tags`
- **THEN** the item is stored with the trimmed `typeLabel` and the validated `tags`

#### Scenario: Oversized metadata rejected on create

- **WHEN** `typeLabel` exceeds 40 characters, `tags` exceeds 10 entries, or any tag exceeds 30 characters
- **THEN** the request is rejected with `400` and no item is created

### Requirement: Update portfolio item

The system SHALL expose `PATCH /portfolio/:itemId` (authenticated, volunteer owner) updating `title`, `description`, `mediaIds`, `visibility`, `typeLabel`, and/or `tags` on the caller's own item. A caller who does not own the item SHALL receive `404` (non-owner treated as not-found, §6). Incoming `mediaIds` SHALL be validated through `MediaOwnership.assertFor(mediaId, volunteerId, 'portfolio_item')`; the linkage SHALL be reconciled — media that are removed from the item SHALL have `portfolioItemId` cleared, and newly added media SHALL have it set. A `mediaId` linked to a different item SHALL be rejected with `409`. `typeLabel`/`tags` SHALL be `$set` only when present in the body, leaving them untouched otherwise, and SHALL respect the create-time bounds.

#### Scenario: Owner updates fields

- **WHEN** the owning volunteer PATCHes title, media, and visibility
- **THEN** only the indicated fields change and the linkage is reconciled atomically

#### Scenario: Metadata updated independently

- **WHEN** an owner PATCHes `typeLabel`/`tags` without resubmitting other fields
- **THEN** only the submitted metadata changes and every other field keeps its stored value

#### Scenario: Foreign caller gets 404

- **WHEN** a volunteer who does not own the item PATCHes it
- **THEN** the response is `404` and the row is unchanged

#### Scenario: Removed media unlinked

- **WHEN** an item's `mediaIds` no longer includes a previously linked media row
- **THEN** that media row's `portfolioItemId` is cleared

#### Scenario: Added media linked and validated

- **WHEN** an item gains a new `mediaId`
- **THEN** the media is validated as owned `portfolio_item` media and its `portfolioItemId` is set to the item

### Requirement: Delete portfolio item

The system SHALL expose `DELETE /portfolio/:itemId` (authenticated, volunteer owner) deleting the caller's own item and clearing `portfolioItemId` on every linked media row, so previously attached media become deletable again. A caller who does not own the item SHALL receive `404`.

#### Scenario: Owner deletes item

- **WHEN** the owning volunteer deletes an item
- **THEN** the item is removed and each linked media row's `portfolioItemId` is cleared

#### Scenario: Foreign caller gets 404

- **WHEN** a volunteer who does not own the item deletes it
- **THEN** the response is `404` and the row remains

### Requirement: Reorder portfolio (atomic batch)

The system SHALL expose `PUT /portfolio/me/order` (authenticated, volunteer role) accepting the volunteer's complete ordered list of item ids and SHALL persist it atomically as a Mongo batch: within a single transaction the service SHALL re-read the volunteer's items, validate the submitted ids are exactly the current own-item set (a foreign or absent id SHALL fail, and a set mismatch SHALL fail), assign fresh sequential `order` values per the submitted sequence, and write every row. Concurrent reorder calls SHALL converge to exactly one complete submitted permutation — never a partial interleave — enforced by the transaction's write-conflict handling (a starved transaction retries against the newer state).

#### Scenario: Complete reorder persisted

- **WHEN** a volunteer submits the full reordered id sequence
- **THEN** every item's `order` matches the submitted sequence and the reads reflect the new order

#### Scenario: Foreign or stale id rejected

- **WHEN** the submitted sequence contains an id the volunteer does not own or that no longer exists
- **THEN** the reorder fails and no `order` changes are persisted

#### Scenario: Set mismatch rejected

- **WHEN** the submitted sequence is missing one of the volunteer's current items
- **THEN** the reorder fails and no `order` changes are persisted

#### Scenario: Concurrent reorders converge

- **WHEN** two reorder requests for the same volunteer race
- **THEN** the final stored order equals exactly one of the two submitted permutations (no interleaved mix)

### Requirement: Public portfolio read

The system SHALL replace the Session 1 inert `PortfolioQueryService` default with the real read and expose public `GET /volunteers/:username/portfolio` (guest, no auth) served by it. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` (A5). For an enabled profile the response SHALL contain only `portfolio_items` rows with `visibility=public`, ordered by `order` ascending, each with media metadata restricted to `visibility=public` media rows (private media never leaks) and with its optional `typeLabel` (included only when set) and `tags` (always present, `[]` when the item has none). This dedicated endpoint does NOT depend on the `showPortfolio` flag (per §2.6). The `PortfolioQueryService` public interface SHALL stay source-compatible so existing consumers are unaffected by the provider swap.

#### Scenario: Disabled or unknown profile is 404

- **WHEN** a guest calls `GET /volunteers/:username/portfolio` for an unknown username or one whose `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Only public items listed

- **WHEN** a guest reads the portfolio of an enabled volunteer who has both `public` and `private` items
- **THEN** only the `visibility=public` items are returned, ordered by `order`

#### Scenario: Private item media hidden

- **WHEN** a public item's `mediaIds` reference media rows of `visibility=private`
- **THEN** those media rows are excluded from the returned metadata

#### Scenario: Metadata surfaced on the public read

- **WHEN** a public item carries `typeLabel`/`tags`
- **THEN** the public payload includes the `typeLabel` and the `tags`

#### Scenario: Metadata absent degrades gracefully

- **WHEN** a public item has no `typeLabel`/`tags`
- **THEN** the public payload omits `typeLabel` and returns `tags: []`

#### Scenario: Dedicated endpoint ignores the showPortfolio flag

- **WHEN** a guest reads the portfolio of an enabled volunteer whose `showPortfolio` flag is off
- **THEN** the public items are still returned (the flag only gates the section on the profile page, §2.6)

#### Scenario: Seam swap keeps consumers source-compatible

- **WHEN** the real `PortfolioQueryService` is bound
- **THEN** consumers calling `getPublicPortfolio(username)` compile against the same interface and receive real data

