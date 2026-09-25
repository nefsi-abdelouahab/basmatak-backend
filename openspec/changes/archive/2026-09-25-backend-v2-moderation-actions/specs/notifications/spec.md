## ADDED Requirements

### Requirement: Admin system notice delivery
The system SHALL support a directly-created (non-bus) notification type `admin.notice` for neutral admin-to-user system notices (standalone `POST /admin/users/:userId/notice` and the composite moderation `notice` action). Delivery SHALL gate on the recipient's `system` notification preference exactly like bus-handler gating (missing prefs row = defaults-on; `system=false` = suppressed, still success). The row SHALL carry `type=admin.notice` with payload `{ message, reportId?, sentAt }` and a `dedupeKey` derived from that payload, so distinct notices (different message/report/timestamp) never collapse. Composite delivery SHALL write through `createInSession` inside the resolution transaction (after the prefs check) so a rolled-back resolution leaves no orphaned notice.

#### Scenario: Notice gated by the system preference
- **WHEN** a notice is delivered to a recipient whose `system` pref is `false`
- **THEN** no `notifications` row is created

#### Scenario: Distinct notices never dedupe
- **WHEN** two notices with different messages (or different triggering reports) target the same user
- **THEN** two `notifications` rows exist

#### Scenario: Rolled-back resolution leaves no notice
- **WHEN** a composite resolution aborts after the notice write
- **THEN** the notice row is not persisted
