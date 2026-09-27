# login-redirect-migration-completion Specification

## Purpose
TBD - created by archiving change frontend-fix-login-redirect-migration-completion. Update Purpose after archive.
## Requirements
### Requirement: All literal next values are locale-less
The system SHALL construct every `next` value passed to `getLoginHref` in the locale-less form (leading `/`, no `/{locale}` prefix), including the 26 guard `next` props and 6 client-page literals normalized by this change, so that every guest redirect target's pathname is exactly `/{locale}/login` with a locale-less `next` that round-trips through post-login navigation without re-prefixing.

#### Scenario: Guest redirect from a normalized site carries locale-less next
- **WHEN** a guest triggers an authed action on any of the 32 normalized sites
- **THEN** the browser pathname is exactly `/{locale}/login` and the decoded `next` equals the locale-less site path.

