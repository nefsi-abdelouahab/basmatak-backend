## Context

Phase 2 completes both own-profile editing surfaces. The backend already stores most fields but completion is not authoritative, skills expose catalog ids instead of row ids, organization phone handling is inconsistent, and the volunteer/org edit pages cover only part of the model. The frontend currently duplicates the organization form across `org/profile` and `org/complete-profile`.

## Goals / Non-Goals

**Goals**
- One backend completion function per role, returning `{percent, missingFields, complete}`.
- Complete, localized, responsive edit forms with shared components and global toasts.
- Privacy-safe visibility defaults and signed-in-only public org phone.
- Canonical Algerian phone storage and account-phone fallback.

**Non-Goals**
- No database migration, no new collections.
- No AI-chat, scrollbar, theme-token, or backend job changes.
- No new locales beyond `en` and `ar`.

## Decisions

1. **Backend-authoritative completion.** Add small exported completion helpers on the volunteer and organization services. Both the dedicated completion route and the volunteer dashboard call the same helper. Weights are fixed constants; `missingFields` is derived from the same predicate map. Keep `completionPercent` on the volunteer dashboard as a compatibility alias.
2. **Skills row identity.** `GET /volunteers/me/skills` keeps the stored row shape but adds `_id`, localized `skillName`/`skillNameAr`/`skillNameFr` (or a nested localized object) and category labels. The frontend uses `_id` for PATCH/DELETE and shows localized names.
3. **Banner media purpose.** Add `volunteer_banner` to `MEDIA_PURPOSES`; `PATCH /volunteers/me` validates `banner` with `assertFor(id, userId, 'volunteer_banner')`. Existing commits with no purpose remain valid for legacy avatar/banner rows? No — avatar already uses purpose `avatar`; banner was previously unvalidated, so new uploads use the new purpose.
4. **Phone normalization.** Add a backend helper that strips separators, accepts `0XXXXXXXXX`, `+213XXXXXXXXX`, `00213XXXXXXXXX`, requires a 9-digit Algerian national number starting `2`–`7`, and returns `+213` + the 9 digits. DTOs use a custom `@Transform` + `@Matches` pair. The frontend mirrors the helper in `lib/api/phone.ts`.
5. **Public phone gating.** `GET /organizations/:slug` uses `OptionalJwtAuthGuard` + optional `@CurrentAccount`. Service receives `viewerUserId`; `contact.phone` is `null` unless a viewer is present. Phone resolution order: organization contact, then owning `users.phone`. The frontend public query key includes the session's authentication marker.
6. **Shared form.** `OrgProfileForm` lives under `components/profile/org/` and is rendered by both routes. It owns field state, validation, lookups, media staging, and PATCH. `org/complete-profile` wraps it with onboarding copy and delete-account.
7. **Shared primitives.** `components/profile/` exports `SectionCard`, `FormField`, `ImageUploader`, `ProfileHero`, `SaveBar`, `VisibilityRow`, `TimeRangeRow`, and `CompletionCard`. Existing `components/ui` primitives are reused inside them, not edited.
8. **Toasts.** Profile mutations keep automatic success toasts (remove the inline “Saved.” duplication) and stop setting `silent: true` so failures surface through the global toast mapper. Inline error states remain as a secondary cue.
9. **Visibility copy.** Toggles reflect the stored `publicProfile` values. The hint explains that off means hidden and names the backend defaults rather than claiming everything is public.

## Risks / Trade-offs

- Adding `volunteer_banner` means older unvalidated banner media ids may fail validation on the next edit. Mitigation: validation applies only when a new banner id is submitted; existing values render without re-validation.
- Guest public org payloads now omit phone; clients that relied on guest phone will need sign-in. This is intentional.
- `missingFields` is a breaking response rename. All current frontend consumers and tests are updated in this change.

## Migration Plan

None. Fields are optional and already present. Deploy backend first; the frontend tolerates both `missing` and `missingFields` during rollout only if needed, then uses `missingFields`.

## Open Questions

None.
