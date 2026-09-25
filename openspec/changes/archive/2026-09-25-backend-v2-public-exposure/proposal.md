## Why

The merged public volunteer profile and talent directory cannot render their designed content: profiles default to private, `stats`/`createdAt` are never public, and several designed fields (headline, availability note, `preferredDomains`, `geographicBase`, public reviews) do not exist. Session 9 makes public profiles opt-out with real stat-backed data.

## What Changes

- **BREAKING (behavior)** — `volunteer_profiles.publicProfile` defaults flip to opt-out: `enabled`, `showBio` (= `showBiography`), `showSkills`, `showPortfolio`, `showExperiences`, `showStats` (new flag) all default `true`. Previously-private profiles become publicly visible by default (decision 5). Volunteers can still disable per field via the existing settings routes.
- Add optional profile fields `headline`, free-text availability note, `preferredDomains[]`, `geographicBase`; accept them on `PATCH /volunteers/me` (new-field writes) and expose them on public reads.
- Expose `lastName` on the public model as merged `fullName`; expose `stats` (gated by new `showStats`), `createdAt`, and a read-time-derived `areasOfContribution` breakdown (no stored field; free-form "Community Contributions" list is CUT per FCD #4).
- Add public `GET /volunteers/:username/reviews` returning only `status=visible` reviews.
- Surface `registryId` on the public payload (already exposed; kept unconditional, not subject to any `show*` gate).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `volunteers`: opt-out defaults, new optional fields, extended public payload (`fullName`, `stats`, `createdAt`, headline/availability-note, derived areas), new `showStats` gate.
- `reviews`: new public read `GET /volunteers/:username/reviews` (visible-only, cursor-paginated).

## Impact

- Touches `backend/src/volunteers` (schema, DTOs, service, public controller) and the `reviews` read path only; no new collections, no new packages.
- Breaking exposure widening per contract rows 1–2: guests see previously-private profiles by default; suppressed blocks must never leak (existing `show*` gating enforced).
