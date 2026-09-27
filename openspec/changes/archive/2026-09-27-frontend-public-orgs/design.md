## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry (`lib/api/client.ts`), the unified error shape + mapper (`lib/api/errors.ts`), the query-key factory, `useSession.ts` + `getLoginHref(locale, next)`, `components/ui/*` primitives, and system screens. FB–FE are archived; FC (`feed.ts`/`useFeed.ts`, `opportunity.ts`/`useOpportunity.ts`) and FD (`orgStats.ts`/`useOrgStats.ts`) established the card/aggregate patterns F18 reuses read-only. F17 (`frontend-public-talent`, active parallel session) owns `(public)/volunteers/[username]`, `(public)/talents`, `publicTalent.ts`/`usePublicTalent.ts`, `publicTalent.*` — F18 is file-disjoint with it by route dir, api module, hook file, and message prefix.

Backend route truth was pinned read-only from existing frontend modules (no `/backend` read needed beyond what FC/FD already verified): `GET /organizations` (public search, `q`/`page`), `GET /organizations/:slug`, `GET /organizations/:slug/opportunities` (`status=published|completed|closed` + voluntary counts), `GET /organizations/:slug/reliability` (F5's `opportunity.ts` documents this as F18-owned — the org embed carries no reliability sub-object), `GET /opportunities` (feed, org + category embeds), `GET /opportunities/:idOrSlug` (published-only, positions with `applicationCount` + assigned names + `skillNames`), `GET /talents`, `GET /skill-categories`, `GET /locations/wilayas`, `GET /media/:mediaId` (guest cover reads). Design source: delta doc V2 §B#24/#27/#28 + RESOLUTION_PLAN 4.1/4.4/4.5 neutral-copy rules. Verified: `lib/api/publicOrgs.ts`, `hooks/usePublicOrgs.ts`, `messages/public-orgs/*`, and the three `(public)` route dirs do not exist yet, so F18 creates them fresh.

## Goals / Non-Goals

**Goals:**
- Three token-driven, en+ar, RTL-correct public routes at 1440/1100/390: landing (search entries, published feed, talent strip, neutral sample card), org profile (facts, aggregates ribbon, per-status archive, neutral reliability), opportunity details (embed meta, positions with counts/names, publisher card, related list) — all guest-safe with Apply/Save → Login.
- One typed api function per consumed endpoint in a single new module (`lib/api/publicOrgs.ts`); all data via a single new hook file (`hooks/usePublicOrgs.ts`); unit + e2e coverage per roadmap §F18 Tests.

**Non-Goals:**
- Merged talent profile + talent directory (F17: `(public)/volunteers|talents`, `usePublicTalent.ts`); any `/backend` / `docs/API.md` / `backend-inventory.md` / archived-change edits; `src/i18n/request.ts` or `lib/query/keys.ts` edits; messaging/ranking/verify-page UI; perks/logistics inputs (FCD cut); attestation generation.

## Decisions

- **D1 — One capability trio, one api module, one hook file.** Three specs → `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts`. Rationale: the three routes share `CursorPage`/`total` handling, embed-only card rendering, `OPP-/ORG-/EXP-` display helpers, guest-redirect wiring, and no-embed fallbacks; splitting per route would triplicate them. Alternative (per-route modules) rejected — roadmap FF parallel-safety is by filename and F18 owns these two files outright.
- **D2 — Embed-only rendering, related via embedded slug.** Cards and the publisher block render from the enclosing payload's embeds; related opportunities resolve `GET /organizations/:slug/opportunities` using the slug carried in the detail org embed (small page, published-only unless the archive covers it). Alternative (per-card org fetch) rejected — roadmap acceptance forbids N+1 and the slug is in-payload per V2 §B#28.
- **D3 — Reliability is F18's own read.** The sidebar/detail never invents trust numbers; `GET /organizations/:slug/reliability` renders as neutral "Submission response rate" (+ per-domain breakdown iff served). F5 deliberately omits reliability from its embed (documented in `opportunity.ts`), so no sibling module is imported. Alternative (reusing orgStats aggregates) rejected — those are private-me reads, not the public slug read.
- **D4 — Own guest media read in `publicOrgs.ts`.** Cover/gallery thumbnails resolve through a module-local `GET /media/:mediaId` wrapper, following the F5/F17 per-module pattern rather than editing archived `media.ts` or importing a sibling module for a guest read.
- **D5 — Guest Apply/Save never mutates.** Controls check session first and route guests via `getLoginHref(locale, next)` preserving the current URL; deadline/seat gating (`applicationDeadline` past, `filledCount >= requiredCount`, non-`published` status) is a pure unit-tested helper that disables Apply with neutral copy. Alternative (guest apply mutation + 401 fallback) rejected — decision 10 requires the redirect before any request.
- **D6 — Favorites consumed, never reimplemented.** Save state comes from card `isFavorited` + `favoriteCount` and toggles through F4 `useFavorites`; no favorite function is added to `publicOrgs.ts` (mirrors F17 D6, preserves one-owner-per-file).
- **D7 — Neutral surface is structural, not copy-editing.** `registryId` renders only as `ORG-/OPP-/EXP-` display text (never a route key/link); "Accredited (Hours)" maps to neutral duration/Founded labels; authority/audit/supervisory/ledger/gazette/dispatch/statutory wording is absent from routes AND catalogs (asserted by unit + DOM guards); logistics trio has no fields and no UI. Alternative (renaming civic labels) rejected — RESOLUTION_PLAN requires removal, not renaming.
- **D8 — Two local commits, one per repository.** `/frontend` is its own git repo, gitignored by the parent (F17 D8 precedent), so the runner's single root `git add -A` cannot capture frontend code; F18 commits code in `/frontend` and OpenSpec artifacts at the root separately. Staging is scoped to this session's files only (never a blind `git add -A` over a tree carrying F17's active work).

## Risks / Trade-offs

- [Risk] F17 active in parallel touches the same `(public)` group parent → Mitigation: disjoint leaf dirs, modules, hooks, prefixes, specs, and e2e files; no shared-file edit on either side; standing rule gates all build/test runs; scoped staging only.
- [Risk] Landing `(public)/page.tsx` collides with F0's `[locale]/page.tsx` placeholder at the same URL (route groups don't segment URLs) → Mitigation: flagged as OQ1 — no archived file is touched until the owner clears the replace/move approach (critical-rule gate in tasks).
- [Risk] Archive per-tab counts key differs from the assumed voluntary `counts` shape → Mitigation: cards render iff served, banner falls back to page `total`; unit test pins both branches (OQ2 confirms the key).
- [Risk] Related scope (published-only vs archive-covered) ambiguous in V2 §B#28 → Mitigation: default published-only small page; OQ3 confirms before Phase 2.
- [Trade-off] Three routes fire several parallel public reads on first paint; accepted — each panel has independent loading/empty/error states so one slow endpoint never blocks the rest.

## Migration Plan

None (new routes only). Rollback = revert the two F18 commits (frontend code + root artifacts); nothing else references the new dirs/module/hook/prefix. Archive via `openspec archive frontend-public-orgs -y` after green verification.

## Open Questions

- **OQ1 (blocking Phase 2):** Landing placement vs F0-owned `app/[locale]/page.tsx` placeholder — confirm the replace/move into `app/[locale]/(public)/page.tsx` (the single archived-file touch this session needs). Proposed: landing owns the `(public)` page and the placeholder is superseded. Owner confirm; no edit until cleared (critical rule).
- **OQ2:** Archive per-tab counts — confirm the voluntary counts key on `GET /organizations/:slug/opportunities` (vs deriving from page `total`). Proposed: render served counts, fall back to `total`.
- **OQ3:** Related list — confirm published-only scope vs including archive-covered items. Proposed: published-only small page.
- **OQ4:** Commit split — confirm two local commits (frontend repo + root, F17 precedent) over the runner's single `git add -A`. Proposed: split with scoped staging.
