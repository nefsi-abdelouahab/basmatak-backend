## ADDED Requirements

### Requirement: Next.js App Router scaffold with strict TypeScript

The system SHALL provide a `/frontend` Next.js App Router application with TypeScript strict mode, eslint, and prettier configured, so that all later sessions build on a reproducible baseline.

#### Scenario: Fresh install builds and lints clean

- **WHEN** a developer runs `npm install` then `npm run build` and `npm run lint` from `/frontend`
- **THEN** the build succeeds with zero TypeScript errors and lint reports zero errors

### Requirement: Canonical source layout

The system SHALL use the canonical `src/` layout: `src/app/[locale]/*` routes, `src/lib/api/*` API modules, `src/hooks/*` query hooks, `src/components/ui/*` primitives, `src/messages/*` catalog sources, `src/theme/*` tokens, so that section file-disjointness (one route dir + one `lib/api/*` + one `hooks/*` file per session) is enforceable by path.

#### Scenario: Layout locations exist

- **WHEN** the scaffold is inspected after creation
- **THEN** each of `src/app/[locale]`, `src/lib/api`, `src/hooks`, `src/components/ui`, `src/messages`, `src/theme` exists and is referenced by the session conventions doc

### Requirement: Standard npm scripts

The system SHALL expose `build`, `lint`, `test` (vitest), and `test:e2e` (Playwright) scripts with the viewport matrix 1440/1100/390 configured, so that every session verifies identically.

#### Scenario: Test runners execute the baseline suite

- **WHEN** a developer runs `npm test` and `npm run test:e2e` from `/frontend`
- **THEN** both runners execute and report pass/fail with zero configuration errors
