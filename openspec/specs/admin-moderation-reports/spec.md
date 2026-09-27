# admin-moderation-reports Specification

## Purpose
TBD - created by archiving change frontend-admin-moderation. Update Purpose after archive.
## Requirements
### Requirement: Enriched admin report triage list

The system SHALL provide an admin-only report triage list at route `admin/reports` backed by `GET /admin/reports` with filters `status` (`open | in_review | resolved | dismissed`), `targetType` (`opportunity | user | organization | review | submission`), `priority` (`low | normal | high`), `assignedAdminId`, `q`, `from`/`to` (ISO date window), and whitelisted `sort` (`newest | oldest | priority`), cursor paging (`cursor`/`limit`, default 20 max 50), totals from the cursor page (`total`/`page`/`pages`), and `format=csv` export through the shared authed blob-download helper. Each row SHALL render its reporter summary (id, username/full name) and target-entity summary (type, id, title/name) plus `title?`, `priority`, `assignedAdminId`, and `status`; unknown `sort` tokens SHALL be rejected client-side before any request. The list SHALL follow the 4 mandates (theme tokens only, `adminModeration` catalog strings only with en+ar + RTL logical properties, centralized API layer + TanStack Query only, responsive at 1440/1100/390).

#### Scenario: Triage list renders enriched rows with totals

- **WHEN** an admin visits `admin/reports` with `status=open`
- **THEN** the list shows reporter + target summaries, priority badges, assignee state, and the count banner reads the page `total`

#### Scenario: Filters rebuild the query and CSV mirrors them

- **WHEN** the admin changes `targetType`, `priority`, `assignedAdminId`, `q`, `from`/`to`, or `sort`
- **THEN** the query string carries only the set filters and the CSV export requests the same filters plus `format=csv` as an attachment download (no navigation)

#### Scenario: Non-admin is refused

- **WHEN** a guest, volunteer, or organization account visits `admin/reports`
- **THEN** guests redirect to Login and non-admin roles see the shared 403 state with no data fetched

### Requirement: Report detail with assign and atomic resolve-with-action

The system SHALL provide a per-report detail view with reporter/target summaries, `reason`/`description`/`title`/`priority`, and history (via `GET /admin/status-histories?entityType=reports&entityId=`), plus `PATCH /admin/reports/:reportId/assign` (`{ assignedAdminId }`) assignment, `PATCH /admin/reviews/:reviewId/hide` review-hide where the target is a review, `POST /admin/users/:userId/notice` (`{ message }`, required non-empty ≤1000 chars) standalone notice, and `PATCH /admin/reports/:reportId` (`{ status, resolution?, action? }`) resolution where `status` is one of `in_review | resolved | dismissed`. Resolve-with-action SHALL be atomic: with `action` present, `status` MUST be `resolved` and `resolution` MUST be present (required, non-empty, ≤4000 chars); the client SHALL build exactly one of the four neutral actions — `unpublish_opportunity` / `close_opportunity` (require `targetType=opportunity`), `suspend_target` (requires `targetType=user|organization`), `notice` (requires `{ userId, message }` payload) — and SHALL reject incompatible action/target pairs and unknown action types client-side before any request. After every `resolved` mutation the client SHALL assert the consequence via re-read (report re-read plus target re-read or its status-history showing the `resolution` as reason) and SHALL surface the 409 `INVALID_STATUS_TRANSITION` / 400 `INCOMPATIBLE_MODERATION_ACTION` states without assuming success. Forbidden sanction vocabulary ("Statutory Sanction", "100% compliance", "Contact Secretariat") SHALL appear nowhere in strings, labels, or copy.

#### Scenario: Report moves to in-review

- **WHEN** an admin sets an `open` report to `in_review`
- **THEN** the report shows `in_review` after re-read and a status-history row exists for the transition

#### Scenario: Atomic resolve with unpublish asserts the consequence

- **WHEN** an admin resolves an `open` report on a `published` opportunity with action `unpublish_opportunity` and a resolution note
- **THEN** the report re-reads as `resolved` with the stored `resolution`, the opportunity re-reads as `closed` (or its history carries the resolution as reason), and both history rows are visible

#### Scenario: Incompatible action blocked before the request

- **WHEN** an admin picks `suspend_target` on an opportunity-targeted report (or `unpublish_opportunity` on a user-targeted report, or an unknown action type)
- **THEN** no request is sent and the UI shows the neutral incompatibility message

#### Scenario: Action without resolution blocked before the request

- **WHEN** an admin picks any `action` while the resolution field is empty
- **THEN** the resolve control stays disabled and no request is sent

#### Scenario: Standalone notice and review-hide

- **WHEN** an admin sends a standalone notice (`POST /admin/users/:userId/notice`) or hides a review (`PATCH /admin/reviews/:reviewId/hide`)
- **THEN** the notice delivery state (or prefs-suppressed neutral state) and the hidden review state are shown after re-read, with 404/409 mapped to neutral copy

