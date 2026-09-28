## MODIFIED Requirements

### Requirement: No hardcoded UI strings in JSX

The system SHALL render no hardcoded user-facing string in JSX — element text
nodes, UI-string attributes, AND error-surface renders — all copy resolves
through next-intl keys present in both `en` and `ar` catalogs, except verbatim
backend envelope messages (backend-owned copy, identical in both locales),
per mandate I18N (roadmap §2.2). The provider-less root error boundary
(`src/app/global-error.tsx`) is the sole documented exception: it renders only
when the i18n provider itself has crashed, so catalogs are unavailable there by
definition.

#### Scenario: Catalog coverage check

- **WHEN** the key-coverage audit runs over route and component sources
- **THEN** every user-facing literal is backed by an en+ar key pair, and any hardcoded JSX string fails the session

#### Scenario: Mutation failure without a backend message shows catalog copy

- **WHEN** an org-review mutation (start-review/accept/reject/verify/remove)
  fails and the error envelope carries no message
- **THEN** the error surface shows `shared.actionError` in the active locale,
  never a hardcoded English fallback

#### Scenario: Backend-provided messages still display verbatim

- **WHEN** a mutation fails and the envelope carries a non-blank message
- **THEN** that message displays verbatim (backend-owned specificity preserved)
