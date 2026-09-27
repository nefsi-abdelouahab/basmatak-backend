# admin-overview Specification

## ADDED Requirements

### Requirement: Admin Dashboard Route
The frontend SHALL provide the route `admin/dashboard` rendering the admin
overview read-model. The screen SHALL consume `GET /admin/stats/overview`,
`GET /admin/analytics/overview`, `GET /admin/analytics/series?days=`,
`GET /admin/analytics/queue`, and `GET /admin/audit-logs` through one typed
function per endpoint in `lib/api/adminAnalytics.ts` and TanStack Query hooks in
`hooks/useAdminAnalytics.ts`. The screen SHALL read `GET /health` and
`GET /system/status` through the existing F0 `lib/api/system.ts` functions
without redefining them. Every figure on the screen SHALL originate from a
response payload; the screen MUST NOT contain hardcoded figures, seeded example
values, or invented peak/record values.

#### Scenario: Admin opens the dashboard
- **WHEN** an admin visits `admin/dashboard`
- **THEN** the screen renders overview totals, the activity series, the attention queue, the audit trail, and the system status card, each populated from its endpoint response

#### Scenario: No figure is authored in the client
- **WHEN** the dashboard source is inspected
- **THEN** no numeric literal stands in for a backend figure and no "peak", "record", or "all-time high" value is rendered

### Requirement: Previous-Period Delta Rendering
Each overview total SHALL render from its `{ current, previous, deltaPercent }`
triple. When `deltaPercent` is `null` — the previous window held no documents —
the screen SHALL render an explicit "no comparison available" state and MUST NOT
display `0%`, `0`, or any other synthesized percentage. Delta figures SHALL be
presented as neutral descriptive values and MUST NOT be labelled as good, bad,
success, or failure.

#### Scenario: Delta with both windows populated
- **WHEN** a total has `current: 12` and `previous: 8` with a `deltaPercent`
- **THEN** the card shows `12` as the current value and renders the supplied percentage

#### Scenario: Delta with a zero previous window
- **WHEN** a total has `previous: 0` and `deltaPercent: null`
- **THEN** the card shows the current count with the "no comparison available" state and renders no percentage

### Requirement: Activity Series Rendering
The screen SHALL render the per-day UTC series returned by
`GET /admin/analytics/series?days=` for signups, applications, and
verifications. The requested `days` window MUST be an integer within the
backend's 1–90 bound. Series points SHALL be rendered in the date order returned
by the backend, and each point SHALL display only the three series values it
carries. The screen MUST NOT extrapolate, interpolate, smooth, or invent values
for dates absent from the response.

#### Scenario: Admin selects a valid window
- **WHEN** the admin selects a series window within 1–90 days
- **THEN** the screen requests that `days` value and renders one entry per returned point

#### Scenario: Window outside the bound
- **WHEN** the series window is set to a value below 1 or above 90
- **THEN** the request is not sent with an out-of-range value

#### Scenario: Sparse dates
- **WHEN** the returned series contains a date with zero for one series
- **THEN** that point renders the returned zero and no placeholder or peak value

### Requirement: Neutral Attention Queue
The screen SHALL render the attention queue from `GET /admin/analytics/queue`,
covering pending verifications, open reports, `under_review` submissions,
suspended users, and suspended organizations, plus the maintenance-mode flag.
The queue SHALL be presented as a neutral "Needs review" list. It MUST NOT use
sanction, enforcement, compliance, or severity vocabulary, MUST NOT render any
mutating control, and MUST NOT expose a moderation action. Each queue entry
SHALL link to the corresponding manage screen owned by the manage-screens session,
and the link SHALL be navigation only.

#### Scenario: Queue renders from the response
- **WHEN** the queue response carries counts for all five categories
- **THEN** each category renders its own count from the response and the maintenance flag renders its stored value

#### Scenario: Queue links onward
- **WHEN** an admin follows a queue entry link
- **THEN** the link targets the matching manage route and carries no action semantics

#### Scenario: Queue is read-only
- **WHEN** the queue panel renders
- **THEN** it exposes no button that changes server state and no sanction, compliance, or enforcement wording

#### Scenario: Zero counts
- **WHEN** a queue category count is `0`
- **THEN** the category renders `0` from the response and is not hidden or replaced by a placeholder

### Requirement: Single-Source Pending Counts
Every pending-style figure SHALL be rendered from exactly one endpoint's
response field. The screen MUST NOT add, average, reconcile, or prefer between
the same concept reported by two endpoints, and MUST NOT derive a count the
backend did not return. Where two endpoints both describe a queue, each card
names the endpoint it reads so the admin can tell the figures apart.

#### Scenario: Shared concept across endpoints
- **WHEN** the stats overview and the analytics queue both report a pending-verification figure
- **THEN** each card renders only its own endpoint's field and neither is summed with nor replaced by the other

#### Scenario: No derived totals
- **WHEN** the screen renders its summary tiles
- **THEN** no tile is computed by combining figures from more than one response

### Requirement: Audit Display Names
The screen SHALL render the newest audit rows from `GET /admin/audit-logs` using
the `actorName` and `targetName` display names supplied by the endpoint. Where
the endpoint supplies no name for an actor or a target, the row SHALL render an
explicit neutral placeholder and MUST NOT fall back to presenting a raw ObjectId
as the primary label. The audit panel is read-only: it SHALL render no edit,
revert, or re-run control.

#### Scenario: Row carries display names
- **WHEN** an audit row supplies both an `actorName` and a `targetName`
- **THEN** the row renders both names as its labels

#### Scenario: Row missing a target name
- **WHEN** an audit row supplies a `null` `targetName`
- **THEN** the row renders the neutral placeholder and does not display the raw entity id as the label

### Requirement: Neutral System Status
The screen SHALL render a system status card from `GET /system/status` showing
the service `status`, `version`, `uptimeSeconds`, the `maintenance` flag, and the
`maintenance.message` when set. The card MUST NOT present a compliance
percentage, a statutory or regulatory synchronization state, or any civic
registry reference. The card SHALL stay reachable while maintenance mode is on
and SHALL report maintenance as a plain operational state.

#### Scenario: Healthy system
- **WHEN** the status response reports `status: 'ok'` and `maintenance: false`
- **THEN** the card renders the status, version, uptime, and an inactive maintenance state

#### Scenario: Maintenance on with a message
- **WHEN** the status response reports `maintenance: true` with a message
- **THEN** the card renders the stored message verbatim and marks maintenance as active

#### Scenario: No compliance or civic copy
- **WHEN** the system status card is inspected
- **THEN** it contains no compliance percentage and no "DZ-NAT-REG sync" or equivalent civic-synchronization wording

### Requirement: Turnaround From Median Decision Hours
The screen SHALL render the verification turnaround figure from
`medianDecisionHours`. When the backend returns `null` — fewer than five
decisions inside the 90-day window — the screen SHALL render an explicit
"not enough data" state and MUST NOT display `0`, a fabricated median, or a
placeholder duration.

#### Scenario: Median available
- **WHEN** the overview returns a numeric `medianDecisionHours`
- **THEN** the turnaround card renders that value as the median decision time

#### Scenario: Median unavailable
- **WHEN** the overview returns `medianDecisionHours: null`
- **THEN** the turnaround card renders the "not enough data" state and no numeric duration

### Requirement: Admin Dashboard Access Control
The route SHALL be restricted to users with the `admin` role. A visitor whose
session is missing or rejected SHALL be redirected to the sign-in route carrying
the return path. An authenticated non-admin — volunteer or organization — SHALL
be shown the forbidden system state instead of any dashboard figure. No
analytics payload SHALL be requested before the role check resolves, and a `403`
from any analytics endpoint SHALL render the forbidden state rather than a
partially populated dashboard.

#### Scenario: Admin visits the dashboard
- **WHEN** a user with the `admin` role visits `admin/dashboard`
- **THEN** the dashboard renders and the analytics endpoints are requested

#### Scenario: Volunteer visits the dashboard
- **WHEN** a user with the `volunteer` role visits `admin/dashboard`
- **THEN** the forbidden system state renders and no dashboard figure appears

#### Scenario: Organization user visits the dashboard
- **WHEN** a user with the `organization` role visits `admin/dashboard`
- **THEN** the forbidden system state renders and no dashboard figure appears

#### Scenario: Guest visits the dashboard
- **WHEN** an unauthenticated visitor visits `admin/dashboard`
- **THEN** the visitor is redirected to the sign-in route with the dashboard as the return path

#### Scenario: Analytics endpoint answers 403
- **WHEN** an analytics endpoint responds `403`
- **THEN** the screen renders the forbidden state instead of a partially populated dashboard

### Requirement: Dashboard Localization And Responsive Layout
All dashboard copy SHALL come from the session's own message catalog pair
`messages/admin-overview/en.json` and `messages/admin-overview/ar.json` under
the `adminOverview` prefix, auto-merged by the existing next-intl configuration.
No user-visible string SHALL be hardcoded in JSX. The layout SHALL use logical
directional utilities so it renders correctly in both directions, and SHALL be
usable at the 1440, 1100, and 390 viewport widths. The English and Arabic
catalogs SHALL expose an identical key set with no empty values.

#### Scenario: Arabic locale
- **WHEN** the dashboard is requested with the `ar` locale
- **THEN** every label resolves from the Arabic catalog and the document direction is right-to-left

#### Scenario: English locale
- **WHEN** the dashboard is requested with the `en` locale
- **THEN** every label resolves from the English catalog and the document direction is left-to-right

#### Scenario: Catalog parity
- **WHEN** the English and Arabic catalogs are compared
- **THEN** their key sets are identical and no value is empty

#### Scenario: Narrow viewport
- **WHEN** the dashboard renders at a 390 pixel viewport width
- **THEN** every panel remains readable and reachable without horizontal overflow
