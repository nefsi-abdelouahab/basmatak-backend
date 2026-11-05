## Context

Favorites already store `(userId, targetType, targetId)` with a unique index. Opportunities key on the opportunity ObjectId; talents resolve a username to the volunteer's `userId`. Organizations have the same account shape as talents: one organization is one account, and the public route is slug-based.

## Goals / Non-Goals

**Goals**
- Organization saves reuse the existing row shape and unique index.
- Lookup stays keyed by the public identifier (slug), matching how cards ask for state.
- List summaries stay lightweight and never expose `fullName` or contact data.

**Non-Goals**
- No new collection, index, or migration.
- No organization-directory route; the empty state links to opportunities.
- No consolidation of the per-area `RequireOrg` guards.

## Decisions

- Store `targetId = organizations.userId` rather than the organization `_id` so the target type matches the talent contract (account id) and cross-type rows stay comparable.
- Resolve slugs in the service; unknown slugs return 404 on save and zero-valued entries on lookup, mirroring talents.
- Extend summaries additively: opportunity rows keep `title`/`slug` and add `status`, `applicationDeadline`, and `organization`; organization rows carry `nameAr`/`nameFr`/`status`; talent rows are unchanged and still expose `username` first.
- Gate the profile Save action to volunteers on the client because the toggle routes are `@Roles('volunteer')`; guests still see it and are redirected to Login.
