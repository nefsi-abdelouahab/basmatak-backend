## MODIFIED Requirements

### Requirement: No hardcoded UI strings in JSX

The system SHALL render no hardcoded user-facing string in JSX — element text
nodes AND UI-string attributes (`title`, `label`, `placeholder`, `alt`, and
ARIA landmark labels such as `aria-label` on navigation landmarks) — all copy
resolves through next-intl keys present in both `en` and `ar` catalogs — per
mandate I18N (roadmap §2.2). The provider-less root error boundary
(`src/app/global-error.tsx`) is the sole documented exception: it renders only
when the i18n provider itself has crashed, so catalogs are unavailable there by
definition.

#### Scenario: Catalog coverage check

- **WHEN** the key-coverage audit runs over route and component sources
- **THEN** every user-facing literal is backed by an en+ar key pair, and any hardcoded JSX string fails the session

#### Scenario: Mode title resolves from the catalog in both locales

- **WHEN** the volunteer opportunity-details screen renders its meta grid
- **THEN** the mode label reads `detail.modeTitle` from the active locale (`"Mode"` / `"طريقة المشاركة"`), never a JSX literal

#### Scenario: Breadcrumb landmarks resolve from the shared catalog

- **WHEN** any screen renders a breadcrumb `<nav>` landmark
- **THEN** its accessible name reads `a11y.breadcrumb` from the common catalog in the active locale, never a JSX literal
