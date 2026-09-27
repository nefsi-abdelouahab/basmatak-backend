## Context

F17 closes the last unbuilt public surface. The backend has fully backed the merged public profile since v2, but two design folders still describe it separately and no route exists. F4's `volunteer/talents/TalentCard.tsx:81` already renders `href={/volunteers/${item.username}}`, so that link is currently dead; this session makes it resolve.

The response shapes below were pinned by reading the backend read-only (no `/backend` edit): `public-volunteers.controller.ts`, `reviews.controller.ts`, `volunteers.service.ts` (`PublicVolunteerProfile`, `TalentCard`, `PublicExperienceCard`, `PublicReviewCard`, `AreaOfContribution`), `common/seams/portfolio-query.service.ts` (`PublicPortfolio`), `volunteers/schemas/volunteer-profile.schema.ts` (`VolunteerProfileStats`, `VolunteerPublicProfile`), `volunteer-availability.schema.ts` (`WeeklySchedule`), and `media.controller.ts`.

Three findings shaped this design and are the reason it is not a mechanical copy of F4's authed talents screen:

1. **The show-flag gate lives only in the profile payload.** `getPublicProfile` returns `null` for every gated-off section, but the standalone `GET /volunteers/:username/experiences` and `GET /volunteers/:username/portfolio` routes only check `publicProfile.enabled` — they do **not** re-apply `showExperiences` / `showPortfolio`. Calling them unconditionally would render content for a volunteer who opted out. The embedded fields are therefore the authoritative gate.
2. **`GET /talents` is a much thinner projection than F4's card assumes.** The backend `TalentCard` carries `username`, `registryId`, `firstName`, `bio`, `location`, `skills`, `avatar`, `stats`, `isFavorited`, `favoriteCount` — and nothing else. F4's `feed.ts` schema declares `headline`, `hasAvailability`, `experienceCount`, `portfolioCount` as `.nullable().optional()`, so they are simply absent today. The public directory must not promise per-card availability/experience/portfolio counts.
3. **`fullName` is returned but must never be displayed.** It is first + last; the acceptance rule forbids surname copy, so the display name is built from `firstName` with `username` as fallback.

`/frontend` is its own git repository, gitignored by the parent, so this session produces **two** local commits (code in `/frontend`, OpenSpec artifacts at the root) rather than the single `git add -A` the generic runner prompt assumes.

## Goals / Non-Goals

**Goals:**
- One merged public profile route executing plan M1 (Talent base + Volunteer media grid + stats strip), with the "Verify on National Ledger" affordance removed in favour of an inline per-experience verification line.
- Opt-out gating that hides closed blocks completely, driven by the profile payload, with no client-side flag defaults.
- A public talent directory sharing the same hook file, with the full server-defined filter/facet/sort/paging surface and honest field projection.
- Guest authed actions redirecting to Login with `next` (decision 10).
- Full 4-mandate compliance: theme tokens only, `publicTalent` en+ar catalogs with RTL, centralized API layer + TanStack Query only, 1440/1100/390 responsive.

**Non-Goals:**
- Landing page, public organization profile, public opportunity details (F18) — including the public Apply action, which belongs to the public opportunity details screen.
- Any edit to `/backend`, `docs/API.md`, `backend-inventory.md`, or an archived change.
- Editing F0's `src/i18n/request.ts`, `src/lib/query/keys.ts`, `components/ui/*`, `src/theme`, `useSession.ts`, or `useFavorites.ts` — all consumed read-only.
- A standalone portfolio page, any messaging/contact/invite UI, a public activity stream, and any `/verify` page (decision #7 and V2 §E#5).

## Decisions

**D1 — The profile payload is the single source of truth for gating; the standalone list routes are strictly paginators.**
`usePublicExperiences` / `usePublicPortfolio` queries are `enabled` only after the corresponding embedded field is confirmed non-null, and their results are merged into the same block that renders the embedded rows. A closed gate means the query never runs. The alternative — calling the standalone routes and trusting them to be gated — leaks opted-out content, because they are not gated. The alternative of rendering only the embedded arrays and dropping the standalone routes would cap the section at the server's internal `MAX_LIMIT` with no way to page; the merge keeps paging without losing the gate.

**D2 — Gating is expressed as a pure, unit-tested resolver, not inline JSX conditionals.**
`resolvePublicProfileSections(profile)` returns a discriminated section map (`{ open: boolean, data }` per block) in `lib/api/publicTalent.ts`. The roadmap names show-flag gating as the session's unit-test target, and a pure function makes "opt-out hides blocks, never leaks" testable without rendering. Components then render `sections.stats.open ? … : null`, which is what makes "no heading, no placeholder, no reserved space" mechanical rather than a per-block discipline.

**D3 — The display name never touches `fullName`.**
`publicDisplayName(firstName, username)` returns `firstName` when non-empty, else `username`. A unit test asserts a payload whose `fullName` contains a surname renders only the first name, which is the only way to keep the acceptance rule from silently regressing when the schema is widened later.

**D4 — Registry codes render through an idempotent prefix helper.**
`registryCode('VOL-000042', 'VOL')` → `VOL-000042`, and `registryCode('000042', 'VOL')` → `VOL-000042`. The stored `registryId` already carries the prefix (`common/counters/registry-id.service.ts` mints `${prefix}${seq}`), and the house pattern in F5 is `OPP-{registryId.replace(/^OPP-/, '')}`. The helper generalises that to `VOL`/`EXP` so a double prefix is impossible. The code is display-only: never a route key, never a link.

**D5 — Own `lib/api/publicTalent.ts` declares its own guest media read.**
Each prior session declared its own `GET /media/:mediaId` wrapper in its own module (`opportunity.ts`, `orgAccount.ts`, `orgInbox.ts`, `orgStats.ts`, `adminLists.ts`). F17 follows suit rather than editing F2's `media.ts` (archived) or importing another session's module for a guest read. Avatar, experience evidence, and portfolio thumbnails all resolve through this one function, keyed per media id.

**D6 — Favorites are consumed, never reimplemented.**
Save state comes from the card/profile `isFavorited` + `favoriteCount` and toggles through the F4 `useFavorites` hook; `isAuthError` (401) falls back to the Login redirect. Adding a favorites function to `publicTalent.ts` would duplicate an archived capability and violate the one-owner-per-file rule.

**D7 — Availability renders weekday slots + note only, and duration is read as minutes.**
Experience `duration` is **minutes** (documented in F6's `experiences.ts:19-20` and distinct from an opportunity's `durationMinutes`). A `hoursFromMinutes()` helper converts for display, mirroring F5's `hoursOf`, and never reads a `durationMinutes` key.

**D8 — The ungated `createdAt` is deliberately not rendered.**
`getPublicProfile` returns `createdAt` unconditionally (it is not behind any `show*` flag), so rendering it would emit a membership-adjacent "member since" claim from a field the volunteer never opted into. The brief's ban on registry-membership copy wins over the roadmap's inclusion of the field: `createdAt` is parsed (it arrives on the payload) but never displayed, and no catalog string exists for it.

**D9 — Paging alignment: the standalone experiences query requests `limit: 50` (the backend `MAX_LIMIT`).**
The profile embeds the newest `MAX_LIMIT` (50) experiences, and the standalone route defaults to 20 / caps at 50. Requesting 20 would make "load more" advance a cursor across items the profile already embedded, so the control would appear to add nothing until the cursor passed 50. Requesting the max 50 makes the merge exact: dedupe by `id` with embedded-first ordering, and `nextCursor` is non-null only when unseen rows genuinely remain. Portfolio needs no such treatment — `getPublicPortfolio` returns the complete `{ items }` set with no cursor, so the embedded `portfolio` is already authoritative and no redundant request is issued when the gate is open.

`/frontend` gets the code commit; the root repo gets the OpenSpec artifacts. A single root `git add -A` would capture zero frontend code because `frontend/` is gitignored, so the runner prompt's single-commit step is split deliberately.

`/frontend` gets the code commit; the root repo gets the OpenSpec artifacts. A single root `git add -A` would capture zero frontend code because `frontend/` is gitignored, so the runner prompt's single-commit step is split deliberately.

## Risks / Trade-offs

- **Opt-out leak via the standalone routes** → D1/D2: gates come from the profile payload and the standalone queries are `enabled: false` while a gate is closed; a unit test asserts a closed `showPortfolio` produces zero portfolio requests.
- **`GET /talents` stays thin, so cards look sparse** → spec the projected fields only and degrade cleanly; availability is a filter, not a card claim. If richer card fields land later, F18/F19 revisit rather than this session inventing them.
- **F4's `TalentCard` still links to `/volunteers/:username` and is unedited** → the link starts resolving when this route ships, which is the intent; the authed screen and the public screen are separate routes and both stay valid.
- **Embedded arrays plus paginated arrays could double-render rows** → D9: the standalone query requests `limit: 50` so its page 1 aligns with the embedded window, and the merge dedupes by `id` with embedded rows first, so a page boundary never repeats a card and "load more" only appears when unseen rows exist.
- **`minExperiences` / `hasAvailability` / `portfolio` arrive as strings** → coerce to the backend's expected string form and drop empties before sending, mirroring F4's param builder.
- **The `showBiography` family is not a single field** → `preferredDomains` is `[]` (not `null`) when the flag is off, so the resolver derives the biography gate from `firstName`/`headline`/`bio`/`availabilityNote`/`geographicBase` and never treats an empty `preferredDomains` as evidence the gate is open.
- **Dirty shared tree** → the standing rule applies: confirm no other session is in flight before running build/start/test:e2e, and scope staging to this session's files rather than a blind `git add -A` over a tree that already carries another session's uncommitted work.

## Migration Plan

Not applicable — no data migration and no deploy step (deployment stays deferred per the roadmap). Rollback is deleting the two route dirs, the api module, the hook file, and the `messages/public-talent` pair; nothing else references them, and reverting the two commits restores the prior state.

## Open Questions

All four were raised in Phase 1 and resolved by the reviewer before implementation:

1. **Public Apply — resolved.** Guest redirect applies to save/favorite only. No apply control renders on the profile; apply belongs to F18's public opportunity details.
2. **Experiences beyond the embedded page — resolved.** Page the full set via the merge under the D1 gate, with the D9 `limit: 50` alignment.
3. **Directory scope — resolved.** `(public)/talents` ships as a real route, not conditional.
4. **Member-since line — resolved.** Dropped entirely; `createdAt` is never rendered (D8). No neutral rephrasing.
