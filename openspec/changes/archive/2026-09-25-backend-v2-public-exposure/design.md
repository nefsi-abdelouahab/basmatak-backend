## Context

Session 9 (S3, with `admin-lists` as the file-disjoint peer: volunteers+reviews vs admin+organizations) applies owner decision 5 (opt-out public profiles) and FCD #4 (derived contribution areas, free-form list cut). Current state: `volunteer_profiles.publicProfile` (`enabled`, `showAvatar`, `showBiography`, `showLocation`, `showSkills`, `showExperiences`, `showAvailability`, `showPortfolio`) defaults all `false`; the public profile exposes no `lastName`, `stats`, `createdAt`, headline, availability note, `preferredDomains`, or `geographicBase` (none of the latter four exist on the schema); reviews are readable only by the receiving volunteer and the giving org. `registryId` (`VOL-`) is already minted (Session 1) and already exposed unconditionally on the public profile and talent cards. S1/S2 (registry payloads, `CursorPage` totals via `execPage`, review `visible`/`hidden` status) are archived prerequisites.

## Goals / Non-Goals

**Goals:**

- Flip new-profile defaults to opt-out and expose the contract row 2 public payload (`stats` under new `showStats`, `createdAt`, `fullName`, headline/availability-note, `preferredDomains`, `geographicBase`, derived `areasOfContribution`).
- Add public `GET /volunteers/:username/reviews` (visible-only, cursor-paginated).
- Keep every suppressed block unleaked (existing `show*` gating, A5/A6 media rules).

**Non-Goals:**

- Any organization payload change (owned by `org-facts`); portfolio/stats beyond the gated blocks; messaging/contact; the CUT free-form contributions list; any new collection, package, or index beyond what the tasks name.

## Decisions

### Opt-out default flip (decision 5, breaking)

New `volunteer_profiles` rows default `enabled`, `showBiography`, `showSkills`, `showExperiences`, `showPortfolio`, and the new `showStats` to `true`, applied directly as specified — no softening, no extra opt-in gating. `showAvatar`, `showLocation`, `showAvailability` are left at their current `false` defaults pending the owner confirmation in Open Questions (the roadmap names only the six flags; the schema carries eight).

### New `showStats` gate + new optional fields

`showStats: boolean` joins `publicProfile` (default `true`, settable via the existing `PATCH /volunteers/me/public-settings` whitelist) and gates the `stats` block on the public profile and talent cards. New optional schema fields: `headline`, `availabilityNote` (free-text note complementing — not replacing — the weekly schedule), `preferredDomains[]`, `geographicBase`; writable via `PATCH /volunteers/me`, never via `public-settings`. Validation bounds (`headline` ≤ 120, `availabilityNote` ≤ 500, `preferredDomains` ≤ 10 × ≤ 60, `geographicBase` ≤ 120) follow the portfolio-meta session's bound pattern; element/shape semantics are proposed free-text pending Open Questions.

### Derived `areasOfContribution` at read time (FCD #4)

Computed in `VolunteersService.getPublicProfile` from the volunteer's verified experiences: join experience `skills` → `skills` catalog → `categoryId` → `skill_categories` for labels; share = count-based percentage per category, sorted descending, capped at 8; no stored field; symmetric in spirit with the private dashboard (whose own card is owned by `experience-enrichment`, not duplicated here). Exact weighting/denominator/rounding and unmapped-skill handling await owner confirmation (Open Questions) — the spec encodes only the roadmap-level shape.

### Public reviews reuse the org-context join

`GET /volunteers/:username/reviews` resolves username → enabled profile (else 404, same as the other public reads), filters `reviews` by that volunteer's `volunteerId` + `status=visible`, paginates with the shared `execPage`/cursor helper (totals included), and attaches the writing-organization identity using the same shape as `ReviewsService.withOrganizationContext`. Requires registering the `reviews` model in `VolunteersModule` (or delegating to `ReviewsService` via module import) — implementation detail for tasks, no seam needed since both modules are in this Section's scope.

### Migration for existing dev data

Idempotent backfill script note: set the six flipped defaults only on rows still matching the old all-`false` default (treated as pristine); rows with any explicitly-`true` flag keep their choices; the caveat that an explicit all-off row is indistinguishable from pristine is documented rather than solved (dev-data only; production has no legacy rows yet).

## Risks / Trade-offs

- **[Risk]** Previously-private profiles become public by default (contract row 1, breaking). **Mitigation:** implemented exactly as decided; acceptance tests assert a new volunteer is public by default and that disabling flips to 404/exclusion.
- **[Risk]** `preferredDomains`/`geographicBase` element semantics are proposals, not sourced. **Mitigation:** Open Questions below; implementation waits for owner confirmation (Phase 1 stops for review regardless).
- **[Risk]** Areas derivation needs catalog joins per public-profile read. **Mitigation:** bounded (≤ 8 groups, batched catalog/category queries, no N+1); private-dashboard symmetry is read-only reuse, not a second computation path owned here.
- **[Risk]** Reviews route adds a third public username-resolved read. **Mitigation:** reuses `findEnabledProfileByUsername` + shared pagination; no new indexes (existing `volunteerId` index serves the filter; `status` is a low-cardinality in-filter predicate).

## Migration Plan

Additive schema change (new optional fields + one new flag with default `true` for new rows). Deploy code, then run the idempotent dev-data backfill note (no production migration needed). Rollback: revert code; new fields are simply unread. No route or field deletions.

## Open Questions

1. **Areas-of-contribution weighting.** Proposed: count-based share per skill category over the volunteer's experiences visible to the caller (public reads: `publicVisibility=public` only), percentages to one decimal, entries with no mappable active category excluded from numerator and denominator, ties broken by category `order` then slug, cap 8. Confirm, or choose hours-weighted (`durationMinutes`-weighted) instead.
2. **Availability note semantics.** Proposed: optional free-text `availabilityNote` field complementing the weekly schedule (e.g. "Available for on-site & remote"), shown under the biography gate. Confirm it is a stored free-text field and not derived from the schedule.
3. **`preferredDomains` element type.** Proposed: free-text strings (≤ 10, each ≤ 60). Confirm, or bind to `skill_categories` refs (slug/ObjectId) instead.
4. **`geographicBase` shape.** Proposed: free-text string (≤ 120, e.g. wilaya name or "Algiers / remote"). Confirm, or bind to a wilaya code instead.
5. **Unlisted flags (`showAvatar`, `showLocation`, `showAvailability`).** The roadmap names six flags; the schema carries eight. Proposed: leave the three unlisted flags defaulting `false` (strict reading). Alternatively flip all eight to `true` for a fully coherent opt-out. Confirm which set ships.
6. **Talent-card surface.** Proposed: cards gain the `stats` block under `showStats` (RP §1.4#2) but NOT `createdAt`/headline/`areasOfContribution` (profile only). Confirm.
7. **Public reviews payload.** Proposed: `{ rating, comment, createdAt, organization { _id, slug, nameAr, nameFr } }` reusing the received-list org-context shape; hidden rows excluded at query time. Confirm shape and that no `show*` flag beyond master `enabled` gates it.
8. **Backfill scope.** Proposed: flip only rows still matching the old all-`false` default; document the explicit-all-off ambiguity for dev data. Confirm.
