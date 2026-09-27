## ADDED Requirements

### Requirement: Merged public talent profile route with neutral identity block

The system SHALL provide the single merged public profile at route `(public)/volunteers/[username]`, served by `GET /volunteers/:username`, keyed by the **raw username with no `@` prefix** (a link, breadcrumb, or avatar URL containing `@` MUST NOT be constructed). This route executes merge plan M1: the Talent folder's layout as the base, plus the Volunteer folder's richer media grid and stats strip. The identity block SHALL render, in order: avatar (only when the payload's `avatar` is present), `firstName` as the display name, `headline`, `bio`, the `registryId` rendered display-only as `VOL-<registryId with any existing VOL- prefix stripped>` (never a route key, never a link target), and location. The payload's `createdAt` SHALL NOT be rendered: the acceptance rules ban registry-membership-adjacent copy, and a "member since"/"joined" line derived from an ungated `createdAt` is exactly such a claim.

The display name SHALL be built from `firstName` only. Although the payload also carries `fullName` (first + last), the surname SHALL NOT be rendered anywhere on this route. The route SHALL follow the 4 mandates (theme tokens only, `publicTalent` catalog strings only with en+ar and RTL logical properties, centralized API layer + TanStack Query only, responsive at 1440/1100/390).

#### Scenario: Profile renders the merged identity block

- **WHEN** a guest opens `/en/volunteers/amineb` for an enabled profile
- **THEN** the page shows the avatar, `firstName` as the display name, headline, bio, the `VOL-` prefixed registry code as plain text, and the location, and it issues exactly one `GET /volunteers/:username` request, and no "member since" or "joined" line derived from `createdAt` renders anywhere on the route

#### Scenario: Registry code never doubles its prefix

- **WHEN** the payload's `registryId` is `VOL-000042`
- **THEN** the rendered code reads `VOL-000042` and not `VOL-VOL-000042`, and it is not wrapped in a link

#### Scenario: Surname is never rendered

- **WHEN** the payload's `fullName` is `Amine Bensalah` and `firstName` is `Amine`
- **THEN** the display name reads `Amine` and the string `Bensalah` appears nowhere on the route

#### Scenario: Special characters in the username resolve safely

- **WHEN** a profile whose username contains URL-special characters is requested
- **THEN** the username is percent-encoded into the request path, the profile renders, and no sibling route (e.g. the talents directory) is matched instead

### Requirement: Opt-out show-flag gating never leaks a hidden block

Every block on the profile SHALL be gated by the show-flag state carried in the `GET /volunteers/:username` payload, where a gated-off block arrives as `null` and an open-but-empty block arrives as an empty collection or an empty schedule. A block whose flag is closed SHALL be omitted entirely: no heading, no label, no count, no placeholder, no empty state, no skeleton, and no spacing reserved for it. An open block with no content SHALL render its own neutral empty state. The mapping is fixed: `stats` ← `showStats`; `skills` ← `showSkills`; `bio`/`headline`/`availabilityNote`/`preferredDomains`/`geographicBase` ← `showBiography`; `location` ← `showLocation`; experiences **and** derived areas of contribution ← `showExperiences`; `availability` ← `showAvailability`; portfolio ← `showPortfolio`; avatar ← `showAvatar`.

The standalone `GET /volunteers/:username/experiences` and `GET /volunteers/:username/portfolio` routes authorize on `publicProfile.enabled` but do **not** re-apply the `showExperiences` / `showPortfolio` flags. The profile route SHALL therefore treat the embedded `experiences` and `portfolio` fields of the profile payload as the **authoritative gate** for those two blocks: the standalone routes SHALL be called only to continue pagination or to load further pages **after** the corresponding embedded field is confirmed open, and SHALL never be used to populate, and SHALL never be requested at all for, a block whose gate is closed. No client-side flag default may re-open a block the payload reports as closed.

#### Scenario: Opted-out stats strip leaves no residue

- **WHEN** the payload's `stats` is `null` (showStats off) while `skills` and `bio` are present
- **THEN** no stats strip, stats heading, stats count or placeholder renders, and the skills and bio blocks render normally

#### Scenario: Closed experiences gate suppresses the experiences route entirely

- **WHEN** the payload's `experiences` is `null` (showExperiences off)
- **THEN** the experiences block and the derived areas-of-contribution block are both omitted and no request is sent to `GET /volunteers/:username/experiences`

#### Scenario: Closed portfolio gate suppresses the portfolio route entirely

- **WHEN** the payload's `portfolio` is `null` (showPortfolio off)
- **THEN** the portfolio block is omitted and no request is sent to `GET /volunteers/:username/portfolio`

#### Scenario: Open but empty block shows a neutral empty state

- **WHEN** the payload's `experiences` is `[]` (showExperiences on, no public rows)
- **THEN** the experiences block renders with its neutral empty state and the areas-of-contribution block is omitted rather than showing a 0% bar

### Requirement: Stats strip and derived areas of contribution

When the stats gate is open the route SHALL render a stats strip from the payload's `stats` object, exposing exactly `completedTasks`, `verifiedExperiences`, and `volunteerHours` with neutral labels. When the areas gate is open the route SHALL render the payload's `areasOfContribution` as read-time-derived contribution areas: at most 8 entries, ordered by `percent` descending, each showing the localized category name (`nameFr`/`nameAr` selected by the active locale), its `percent`, and its `count`. Areas SHALL be rendered only as delivered by the backend; the client SHALL NOT recompute, re-weight, or invent shares, SHALL NOT offer any editor control, and SHALL NOT render a free-form "Community Contributions" list (cut by FCD #4). Percentages are informational and SHALL NOT be presented as an acceptance, success, or performance rate.

#### Scenario: Stats strip lists exactly the three public stats

- **WHEN** the stats gate is open with `stats` = `{completedTasks: 24, verifiedExperiences: 18, volunteerHours: 96}`
- **THEN** the strip shows those three values with neutral labels and no fourth stat, endorsement count, credential count, or partner count

#### Scenario: Derived areas render in descending order, capped at 8

- **WHEN** the areas gate is open and the payload returns 10 areas
- **THEN** at most the top 8 render, ordered by `percent` descending, each with its locale-appropriate category name

#### Scenario: No invented or recomputed percentages

- **WHEN** the areas gate is open
- **THEN** each rendered percentage equals the `percent` the payload supplied and the route exposes no edit, recompute, or "acceptance rate" control

### Requirement: Availability renders weekday slots plus an optional note only

When the availability gate is open the route SHALL render the payload's `availability` weekly schedule as per-day time slots for the seven day keys, each slot showing its `from`–`to` range, and MAY additionally render the payload's `availabilityNote` free text. The route SHALL NOT render any other availability affordance: no recurring/one-off toggle, no date pickers, no hour quotas, no "commitment hours" control, and no free-text editor. When the gate is open but every day is empty, the block renders its neutral empty state; when the gate is closed the whole block is omitted per the gating requirement.

#### Scenario: Weekday slots and note render

- **WHEN** the availability gate is open with slots on `monday` and `thursday` and a non-empty `availabilityNote`
- **THEN** the block lists only those two days with their `from`–`to` ranges and shows the note text

#### Scenario: Closed availability omits the block

- **WHEN** the payload's `availability` is `null`
- **THEN** no availability heading, grid, or note renders

### Requirement: Verified experiences with an inline verification line and no ledger link

The experiences block SHALL render the payload's experience cards: `title`, `description`, `duration` (a **minutes** value, never `durationMinutes`), `skills`, the `EXP-` prefixed `registryId`, the contributing organization's display name from the `organization` embed (`nameFr`/`nameAr` by locale, with `slug` used only to build an organization link), the `verifiedAt` date, and any `evidence` media resolved through `GET /media/:mediaId` as a guest. Each verified experience SHALL carry an inline neutral confirmation line built from its own data — "✓ Verified by [organization] on [date]" — using the success token for the checkmark only.

The route SHALL NOT render any "Verify on National Ledger" affordance, ledger link, QR code, attestation-verification page, or `/verify` navigation of any kind, because no such public platform route exists. The experience `verificationCode` SHALL NOT be rendered as a scannable or navigable verification artifact. The free-text reviewer `review` notes and `rating` on an experience SHALL NOT be rendered as an endorsement score, tier, or rating widget.

#### Scenario: Inline verification line replaces the removed ledger link

- **WHEN** an experience has `organization.nameFr` = "Association Numérique", `verifiedAt` = 2026-03-14, and a `verificationCode`
- **THEN** the card shows "✓ Verified by Association Numérique on 14 Mar 2026" and the words "National Ledger" appear nowhere on the route

#### Scenario: Experience duration renders from minutes

- **WHEN** an experience carries `duration: 180`
- **THEN** the card shows 3 hours derived from the minutes value, and no `durationMinutes` key is read

#### Scenario: Evidence media resolves as a guest

- **WHEN** an experience carries evidence media and the visitor is a guest
- **THEN** the media is fetched through `GET /media/:mediaId` and renders, and no upload or ownership affordance appears

### Requirement: Portfolio media grid

When the portfolio gate is open the route SHALL render a media grid from the portfolio payload's `items`, each showing its `title` (when present), `description` (when present), `typeLabel` (when present), and `tags`, with its `media` array rendered as thumbnails. Image-type media SHALL resolve through `GET /media/:mediaId`; link-type media SHALL render as a plain anchor using its `url` and SHALL NEVER render as an embedded player, iframe, or video element. Items with no renderable media SHALL still render their text content. A media row that the backend omits (non-public or deleted) SHALL NOT produce a broken image, and file size SHALL NOT be displayed because no size field is public.

The route SHALL NOT provide upload, reorder, delete, visibility-toggle, or "Featured" controls, and SHALL NOT exist as a standalone portfolio page — the portfolio is a section of this merged profile only (decision #7).

#### Scenario: Grid renders text and image media

- **WHEN** a public item has a title, tags, and one image-type media row
- **THEN** the grid cell shows the title, its tags, and the resolved image, with no edit control

#### Scenario: Link-type media renders as a plain anchor

- **WHEN** a media row has `type: 'link'` and a `url`
- **THEN** it renders as an ordinary anchor and no player, iframe, or `<video>` element is created

#### Scenario: No portfolio editing affordances

- **WHEN** the portfolio gate is open
- **THEN** the section exposes no upload, reorder, delete, visibility, or featured control, and no separate portfolio route is reachable from it

### Requirement: Neutral public reviews section

When the reviews endpoint is reachable the route SHALL render a section titled with the neutral phrase "Recommended by organizations" over `GET /volunteers/:username/reviews`, listing each visible review's `rating`, `comment` (when present), `createdAt`, and the writing organization's display name from its `organization` embed. Reviews SHALL be cursor-paginated and SHALL NOT display an endorsement count, a tier, a star-score aggregate, a "Verified Contributor" badge, or any ranking. A volunteer with no visible reviews SHALL render the section's neutral empty state rather than omitting the heading.

#### Scenario: Reviews render with org identity and no endorsement framing

- **WHEN** two visible reviews exist, one from "Association Numérique" rated 5 and one rated 4
- **THEN** the section lists both with their ratings, comments, dates and organization names, and no total count, tier label, or aggregate score is shown

#### Scenario: Empty reviews keep a neutral section

- **WHEN** the reviews page has zero items
- **THEN** the section renders its heading with a neutral empty message and no zero-count badge

### Requirement: Guest authed actions redirect to Login

Every authed action on this public route SHALL redirect a guest to Login with a `next` parameter pointing back at the current profile URL, because the backend only ever answers 401. This includes saving/favoriting the talent. The route SHALL NOT render messaging, contact, invite, or direct-contact affordances, and SHALL NOT render an apply control, because applying to an opportunity is owned by the public opportunity details screen (F18).

#### Scenario: Guest save redirects to Login

- **WHEN** a guest activates the save control on a public profile
- **THEN** the browser navigates to `/{locale}/login?next=<encoded current profile URL>` and no favorite mutation is sent

#### Scenario: No contact or invite affordance exists

- **WHEN** the profile renders for any visitor
- **THEN** no message, contact, invite, email, or phone control is present

### Requirement: Neutral public surface, no civic or verification-tier narrative

The route SHALL present a neutral civic-network surface. The following SHALL appear nowhere in its markup or its `publicTalent` catalogs, in any locale: surname rendering, tier or verification-level labels ("Level 2 Verified", "Verified Contributor", "Identity Verified"), registry-membership claims ("Civic Registry member since", "member since", "joined" derived from the payload's ungated `createdAt`), endorsement or credential counts, and civic-registry, supervisory-authority, or audit vocabulary. The route SHALL NOT render a public activity stream: the profile shows experiences, portfolio, and reviews only, because activity feeds are private per-account.

A request for an unknown or `publicProfile.enabled=false` profile SHALL render the shared not-found state with no data, no partial identity, and no distinction between "does not exist" and "opted out" beyond the neutral copy.

#### Scenario: Forbidden vocabulary is absent in both locales

- **WHEN** the route and its `publicTalent` catalogs are scanned in `en` and `ar`
- **THEN** no tier label, membership claim, endorsement count, or registry/authority/audit term is present, and the surname never renders

#### Scenario: No public activity stream

- **WHEN** the profile renders
- **THEN** no activity or timeline section is present and no activity endpoint is called

#### Scenario: Disabled or unknown profile renders the not-found state

- **WHEN** the profile request fails with 404 (`VOLUNTEER_PROFILE_NOT_FOUND` / `VOLUNTEER_NOT_FOUND`)
- **THEN** the shared not-found state renders with no identity, stats, or section headings, and the loading and error states resolve without an unhandled error
