## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs (`src/messages/<area>/{en,ar}.json` + parity tests, auto-merged — `src/i18n/request.ts` never edited), the axios singleton with 401 refresh-and-retry, TanStack Query + key factory (`src/lib/query/keys.ts`), `components/ui/*` primitives, and the shared 2-step media-upload helper (images/PDF ≤5 MB + imagery-consent pattern). FB (F1/F2/F3, archived) shipped auth guards/session states, `hooks/useAccountSettings.ts` (email/phone, change-password, sessions + logout-others, notification prefs, delete confirm — the settings pattern F13 reuses read-only), and `lib/api/organizations.ts` (me read/patch, profile-completion, verification submit/status — owned by F3, never edited here). F13 builds the two org self-service screens (delta doc V2 §B#16/#17). Backend route truth was re-verified read-only in `backend/src`: `GET/PATCH /organizations/me` (expanded fact set incl. `type`, `registrationNumber`, `location{}`, `website`, `foundedYear`, `contact{}`, `focusDisciplines[]`, `operatingScope`, `coverMediaId`, nullable `annualReportMediaId`), `GET /organizations/me/profile-completion`, `DELETE /organizations/me` (soft-archive + session revoke), `PATCH /users/me`, `POST /auth/change-password`, `GET/DELETE /users/me/sessions[/:sessionId]`, `POST /auth/logout-others`, and `GET/PATCH /notifications/preferences` all exist; org visibility is the neutral `publicProfile.enabled` toggle (orgs are not in the talent directory).

## Goals / Non-Goals

**Goals:**
- Two token-driven, en+ar, RTL-correct routes (`org/profile`, `org/settings`) at 1440/1100/390: full factsheet editing + cover/logo uploads + completion display + annual-report optional link; email/phone, password, sessions + logout-others, notification prefs, neutral visibility toggle, confirm-gated delete-org.
- One typed api function per consumed endpoint in a single new module (`lib/api/orgAccount.ts`); all data via a single new hook file (`hooks/useOrgAccount.ts`); unit + e2e coverage per roadmap §F13 Tests (incl. public-profile spot-check via the F18 route).

**Non-Goals:**
- Dossier upload (F3: `org/verification-dossier`, `useOrgOnboarding.ts`); workspace aggregates (F9); opportunity CRUD (F10); review queues (F11); records/CSV (F12); admin org management (F15); public rendering (F17/F18 — F18 spot-checks these facts read-only); any `/backend` / `docs/API.md` / archived-change / sibling-file edits.

## Decisions

- **Two capabilities, one api module, one hook file.** `org-profile` + `org-settings` specs → `lib/api/orgAccount.ts` + `hooks/useOrgAccount.ts`. Rationale: profile and settings are distinct screens with distinct acceptance gates (fact-purity vs session/delete gating), but share the me-read, PATCH-me, and media-confirm plumbing; one module/hook file keeps the roadmap's one-hook-file rule while the two specs keep review gates separate. Alternative (two modules) rejected — roadmap FD parallel-safety is by filename and F13 owns both files outright; splitting would duplicate query-key and error handling.
- **Own module, never extend `organizations.ts`.** F3 owns `lib/api/organizations.ts`; F13 writes parallel functions in `orgAccount.ts` even where endpoints overlap (me read/patch, profile-completion). Rationale: file-disjointness is verified by path — editing F3's archived module would violate it. Alternative (import from `organizations.ts`) rejected — cross-change imports couple archive boundaries.
- **F2 settings pattern reused read-only.** Session rows (`device`/`userAgent` + derived `isCurrent`), logout-others-keeps-current, prefs GET/PATCH, change-password 8–72, and delete confirm-gate mirror `useAccountSettings.ts` logic without importing or editing it. Rationale: same backend shapes, separate ownership. Alternative (shared settings hook) rejected — would require editing F2's archived file.
- **Uploads go through the F0 shared 2-step helper.** Cover (`organization_cover`), logo (`organization_logo`), annual-report link (`organization_document`) all use `POST /media/uploads` → PUT → `POST /media/:mediaId/confirm` with ≤5 MB image/PDF guard + imagery-consent checkbox. Rationale: cross-cutting upload contract. Alternative (per-screen upload code) rejected — violates the single-blob-path mandate.
- **Completion is display-only.** `GET /organizations/me/profile-completion` renders percent + remaining-field links; no client-side completion math. Rationale: F3 owns the completion semantics; duplicating the math risks drift. Alternative (client checklist math) rejected.
- **Delete-org ends locally.** After `DELETE /organizations/me` success, revoke local session state and render Login; no post-delete org UI. Rationale: backend soft-archives org + user and revokes sessions — there is nothing left to display. Alternative (goodbye screen) rejected — unowned route, unneeded surface.
- **Message ownership: `orgAccount.*` prefix only.** Single catalog pair (`src/messages/org-account/{en,ar}.json` + parity test); no other prefix touched, so catalog merges stay conflict-free and `src/i18n/request.ts` is never edited (auto-merge).
- **`ORG-<registryId>` is display-only.** Rendered from `GET /organizations/me` (`registryId`), never a route key. Contact fields keep neutral labels. No statute/"Law 12-06"/authority/audit strings exist anywhere.

## Risks / Trade-offs

- [Risk] `organizations.ts` (F3) and `orgAccount.ts` (F13) expose parallel me read/patch functions → Mitigation: F13's functions are the only ones imported by `org/profile|settings`; a code comment marks the F3 module as do-not-import-here; no shared-helper extraction (would touch archived files).
- [Risk] F18 public-profile spot-check depends on F18 routes existing → Mitigation: spot-check is written against the F18 route contract (`(public)/orgs/[slug]`); if F18 is unimplemented at F13 test time, the check runs with a mocked public read and is re-run at F18/F19.
- [Risk] FC↔FD parallel work touching shared primitives → Mitigation: F13 consumes `components/ui/*`, theme, i18n setup, axios client, and blob helper read-only; any needed shared change is flagged, not edited.
- [Trade-off] Single `useOrgAccount.ts` serves two screens (more queries in one file); accepted per one-hook-file rule — queries are per-section with independent loading/empty/error states so profile and settings never block each other.

## Migration Plan

None (new routes only). Rollback = revert the single F13 commit. Archive via `openspec archive frontend-org-account -y` after green verification.

## Open Questions

- **OQ1:** Logo media field name — backend fact set exposes `coverMediaId` explicitly; is the logo carried as a sibling media field on the org record or inside `contact{}`/profile extensions? Proposed: verify read-only in `backend/src` at implementation start; if no dedicated field exists, logo binds to the same 2-step flow and the nearest documented field with a spec delta note. Owner confirm (blocking for logo only, not cover).
- **OQ2:** Should `org/settings` surface the verification status (pending → verified) as context for the visibility toggle, or keep settings strictly account-scoped with verification living in F3/F9? Proposed: strictly account-scoped; verification status renders on `org/profile` + F9 dashboard only. Owner confirm (non-blocking).
