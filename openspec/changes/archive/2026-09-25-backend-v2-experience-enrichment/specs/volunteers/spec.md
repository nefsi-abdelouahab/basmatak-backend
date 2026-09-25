## MODIFIED Requirements

### Requirement: Volunteer dashboard
The system SHALL expose `GET /volunteers/me/dashboard` returning (a) a profile completion percentage derived from how many profile fields are filled, (b) `stats` read from `volunteer_profiles.stats`, and (c) `latestVerifiedExperience` (RP §1.1#1): the caller's newest `volunteer_experiences` row (any `publicVisibility`) in the enriched own-variant shape (`id`, `registryId`, `title`, `description`, `skills`, real `duration`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, `verificationCode`, neutral `review { rating, notes } | null`), or `null` when the volunteer has no experience yet.

#### Scenario: Completion percentage computed
- **WHEN** a volunteer partially fills their profile and calls the dashboard
- **THEN** the completion percentage reflects the filled portion of the defined profile fields

#### Scenario: Stats are zeroed before Session 11
- **WHEN** a volunteer calls the dashboard before any verification has happened
- **THEN** `stats` fields (`completedTasks`, `verifiedExperiences`, `volunteerHours`) are `0` and `latestVerifiedExperience` is `null`

#### Scenario: Dashboard carries the latest verified experience
- **WHEN** a volunteer with at least one verified experience calls the dashboard
- **THEN** `latestVerifiedExperience` is the newest experience row with org identity, `verifiedAt`, `verificationCode`, `registryId`, and real `duration`

### Requirement: Public volunteer experiences
The system SHALL expose public `GET /volunteers/:username/experiences` (guest, no auth). An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404`. For an enabled profile the response SHALL be cursor-paginated (S1 convention, default 20, max 50), newest-first, and SHALL contain only `volunteer_experiences` rows with `publicVisibility=public`, each exposing the snapshot fields (`title`, `description`, `skills`, real `duration`), the neutral `registryId` (`EXP-` format), `verificationCode`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, neutral `review { rating, notes } | null` (only when the linked review has `status=visible`), and evidence metadata restricted to `visibility=public` media. The `skills` field shape (string ids) is unchanged, so the read-time `areasOfContribution` derivation is unaffected. This dedicated listing endpoint does NOT depend on the `showExperiences` flag (per §2.6); that flag only controls whether the section appears on the profile page.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username/experiences` for an unknown username or a profile with `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Only public-visibility experiences listed
- **WHEN** a guest reads the experiences of a volunteer who has both `public` and `private` experiences
- **THEN** only the `publicVisibility=public` rows are returned, newest-first, cursor-paginated, each carrying its `EXP-` registry identifier, org identity, `verifiedAt`, and `verificationCode`

#### Scenario: Evidence media restricted to public
- **WHEN** an experience's `evidenceIds` include media rows of `visibility=private`
- **THEN** those rows are excluded from the evidence metadata (A6)

#### Scenario: Public review shown only when visible
- **WHEN** a guest reads an experience whose linked review has `status=hidden`
- **THEN** the card's `review` is `null` while all other enriched fields remain

### Requirement: Public volunteer profile
The system SHALL expose public `GET /volunteers/:username` (guest, no auth) returning the volunteer's public profile. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` in the error envelope (A5). For an enabled profile the response SHALL include `username`, `fullName` (first and last name merged; `lastName` is public — decision 5 surname exposure), the neutral `registryId` (unconditionally, not subject to any `show*` gate), `createdAt`, and each section gated by its `show*` flag: `firstName` and `bio` under `showBiography`, `headline`, `availabilityNote`, `preferredDomains`, `geographicBase` under `showBiography`, `avatar` under `showAvatar` (only when the media row is `visibility=public`), `location` under `showLocation`, `skills` under `showSkills` (from `volunteer_skills` joined to the catalog, with `skillId`, names, `level`, `isPrimary`), `experiences` under `showExperiences` (limited to rows with `publicVisibility=public`, each in the enriched card shape: org identity, `verifiedAt`, `verificationCode`, `registryId`, real `duration`, neutral visible-only `review`), `availability` under `showAvailability` (the weekly schedule), `portfolio` under `showPortfolio` (served by the unchanged Session 1 `PortfolioQueryService` seam, empty until S14), `stats` under the new `showStats` flag, and the derived `areasOfContribution` breakdown. Sections whose flag is off SHALL be omitted/null. Private fields (`userId`, `email`, `phone`, `birthDate`) SHALL never be returned. No free-form "Community Contributions" list SHALL exist anywhere in the payload (CUT per FCD #4).

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username` for an unknown username or one whose `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Enabled profile exposes flagged sections
- **WHEN** a guest calls `GET /volunteers/:username` for an enabled profile with `showBiography`, `showSkills`, `showExperiences`, `showAvailability`, `showStats`, and `showLocation` set
- **THEN** those sections are populated from live data and the neutral `registryId`, `fullName`, and `createdAt` are present

#### Scenario: Enriched experience cards on the profile
- **WHEN** a guest reads the `experiences` section of an enabled profile
- **THEN** each card carries org identity, `verifiedAt`, `verificationCode`, `registryId`, and real `duration`

#### Scenario: Flag-off sections are hidden
- **WHEN** a profile section has its `show*` flag set to `false`
- **THEN** that section is omitted/null in the public profile, while the unconditional `registryId` is still present

#### Scenario: Stats hidden when showStats is off
- **WHEN** a profile has `showStats=false`
- **THEN** the public profile contains no `stats` block while all other enabled sections remain visible

#### Scenario: Private avatar media hidden
- **WHEN** a profile's `showAvatar` is true but the avatar media row is `visibility=private`
- **THEN** the avatar is omitted (null), not leaked

#### Scenario: Private fields never leak
- **WHEN** a guest reads any enabled public profile
- **THEN** no `userId`, `email`, `phone`, or `birthDate` data is present in the response

#### Scenario: No free-form contributions list
- **WHEN** a guest reads any enabled public profile
- **THEN** the payload contains no free-form "Community Contributions" text list; contribution insight appears only as the derived `areasOfContribution` breakdown
