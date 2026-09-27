## ADDED Requirements

### Requirement: Organization fact header
The system SHALL render the org fact header on `org/dashboard` from `GET /api/v1/organizations/me`, showing name, `ORG-<registryId>` display-only (never a route key), location labels, `foundedYear`, verification status, and cover from real `coverMediaId` only — otherwise a neutral empty state SHALL render (no placeholder cover image, no invented facts).

#### Scenario: Fact header renders real facts with ORG display code
- **WHEN** an authenticated org opens `org/dashboard`
- **THEN** the system requests `GET /api/v1/organizations/me` and renders name, `ORG-<registryId>`, location, founded year, and verification status.

#### Scenario: Missing cover renders neutral empty state
- **WHEN** the org record has no `coverMediaId`
- **THEN** no cover image renders and a neutral empty state is shown (no placeholder, no stock image).

### Requirement: Stat cards from private aggregates
The system SHALL render dashboard stat cards exclusively from `GET /api/v1/organizations/me/stats` (`opportunitiesActive`, `opportunitiesCompleted`, `applicationsPending`, `applicationsUnderReview`, `participantsActive`, `participantsCompleted`, `verifiedHours`, `decisionsLast30d`, optional `decidedRatio`/`medianDecisionHours`). Hours SHALL render from `verifiedHours` (backend `sum(durationMinutes)`). No invented totals SHALL appear.

#### Scenario: Stat cards match stats payload
- **WHEN** the dashboard loads with a stats fixture
- **THEN** every card value equals the corresponding `GET /api/v1/organizations/me/stats` field and hours equal `verifiedHours`.

#### Scenario: Optional reliability fields render only when present
- **WHEN** the stats payload omits `decidedRatio`/`medianDecisionHours`
- **THEN** those cards are hidden (no zeroes invented, no placeholder copy).

### Requirement: Submissions-to-review summary
The system SHALL render a submissions-to-review summary from `GET /api/v1/organizations/me/submissions` (small page: pending-family statuses, volunteer + opportunity joins, `total` banner) with onward links to the F11 contributions queue. No start-review/verify/reject action SHALL exist here (F11-owned).

#### Scenario: Submissions summary links to review queue
- **WHEN** the dashboard submissions summary loads
- **THEN** the system requests `GET /api/v1/organizations/me/submissions` and renders joined rows with the `total` count and links to `org/contributions`, with zero approve/reject affordances in the DOM.

### Requirement: Recent-applications summary
The system SHALL render a recent-applications summary from `GET /api/v1/organizations/me/applications` (aggregate inbox, newest first, applicant + opportunity name joins, `total` banner) with onward links to the F11 applications inbox. No accept/reject action SHALL exist here (F11-owned).

#### Scenario: Applications summary links to applications inbox
- **WHEN** the dashboard applications summary loads
- **THEN** the system requests `GET /api/v1/organizations/me/applications` and renders joined rows with the `total` count and links to `org/applications`, with zero accept/reject affordances in the DOM.

### Requirement: Participants snapshot
The system SHALL render a participants snapshot from `GET /api/v1/organizations/me/participants` (small page, active/completed counts from `total`) with an onward link to the F11 participants roster. No remove/reassign action SHALL exist here (F11-owned).

#### Scenario: Participants snapshot shows counts and roster link
- **WHEN** the dashboard participants snapshot loads
- **THEN** the system requests `GET /api/v1/organizations/me/participants` and renders the `total`-derived snapshot with a link to `org/participants`.

### Requirement: Activity feed
The system SHALL render the org activity feed from `GET /api/v1/organizations/me/activity` (newest first) with loading/empty/error states.

#### Scenario: Activity renders newest first
- **WHEN** the dashboard loads
- **THEN** the system requests `GET /api/v1/organizations/me/activity` and renders items newest-first with loading/empty/error states.

### Requirement: Publish-gate surfacing
The system SHALL surface publish gating from `GET /api/v1/organizations/me/publish-gate` (`{ locked, pendingCount, threshold, pendingOpportunities }`): when `locked` is true a gate-locked banner SHALL explain publishing is locked with the pending count and link to verification/publish status; when false no lock banner SHALL render. Copy SHALL stay neutral (verification state, never civic-narrative wording).

#### Scenario: Pending org sees publish-locked explanation
- **WHEN** the gate payload returns `locked: true`
- **THEN** a gate-locked banner renders with `pendingCount`/next-step copy and no publish CTA is offered from the dashboard.

#### Scenario: Verified org sees no lock banner
- **WHEN** the gate payload returns `locked: false`
- **THEN** no lock banner renders.

### Requirement: Notifications strip
The system SHALL render a notifications strip from `GET /api/v1/notifications` (polled read, newest first, unread marker) with loading/empty/error states and no push-subscription UI.

#### Scenario: Notifications render from polled read
- **WHEN** the dashboard loads
- **THEN** the system requests `GET /api/v1/notifications` and renders the strip newest-first with unread markers.

### Requirement: Dashboard mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `org/dashboard` (theme tokens only; `orgWorkspace.*` strings en+ar with RTL logical properties; data only via `lib/api/orgStats.ts` + `hooks/useOrgStats.ts` over the F0 axios client; responsive at 1440/1100/390), handle 401/403/404/429/503 via the F0 error mapping with org-guest redirect to Login, and SHALL NOT implement opportunity CRUD (F10), review-queue detail or approve/reject (F11), records/CSV (F12), profile/settings edits (F13/F3), messaging, ranking, or any cover placeholder.

#### Scenario: Guards exclude out-of-scope affordances
- **WHEN** the dashboard renders
- **THEN** no opportunity create/edit, application accept/reject, submission verify/reject, message-thread, or placeholder-cover affordance exists in the DOM.
