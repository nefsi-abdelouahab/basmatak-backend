## Context

F0 (archived) shipped theme tokens, next-intl catalogs (`messages/<area>/{en,ar}.json`), axios client with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the **download-only** blob helper (`lib/api/download.ts`). F2 builds the two missing volunteer screens (delta doc §C#4–5) on those primitives. Backend route truth was re-verified in `backend/src`: all F2 endpoints exist **except** `GET /volunteers/me/public-settings` (PATCH only — toggles read from `GET /volunteers/me`). Registration UI belongs to F1 (`(auth)/register-volunteer`, `lib/api/auth.ts`); F2 consumes `changePassword`/`logoutOthers` from it import-only.

## Goals / Non-Goals

**Goals:**
- Two token-driven, en+ar, RTL-correct routes (`volunteer/profile`, `volunteer/settings`) at 1440/1100/390 viewports.
- One typed api function per consumed endpoint; all data via two hook files; unit + e2e coverage per roadmap §F2 Tests.
- Ship `lib/api/media.ts` as the single shared 2-step upload helper (purpose `avatar` here; F3/F7/F8/F10 reuse).

**Non-Goals:**
- Registration screen, public profile rendering (F17), dashboard screen (F4), dossier upload (F3), any `/backend` or archived-change edits.

## Decisions

- **Follow roadmap file split over CONVENTIONS.md "one hook file".** Roadmap mandates `useVolunteerAccount.ts` + `useAccountSettings.ts` (profile vs settings concerns, mirrored by F13's `useOrgAccount.ts`). Rationale: settings logic (sessions, prefs, delete) is reused as a pattern by F13; one file would couple profile completion to account danger-zone. No archived file is edited; deviation recorded.
- **Toggles read from `GET /volunteers/me`, written via `PATCH /volunteers/me/public-settings`.** Alternative (adding a backend GET) rejected — never touch `/backend`.
- **`lib/api/media.ts` owns the 2-step flow** (`createUpload` → raw PUT with `onUploadProgress` → `confirmUpload`), returning progress callbacks; avatar composes it then `PATCH /volunteers/me`. Alternative (avatar-local upload code) rejected — F3/F7 need the same helper and exactly one session may add shared pieces.
- **F1 dependency via import, not duplication.** `changePassword`/`logoutOthers` imported from `lib/api/auth.ts` (F1-owned). If F1 is not yet implemented when Phase 2 starts, settings tasks 4.2/4.3 block — flagged in tasks.
- **Opt-out copy proposed, pending OQ2 confirm:** "Show X publicly" switch labels, all default ON, helper text stating public-by-default.
- **Progress UI proposed, pending OQ1 confirm:** thin token-driven bar (`primary`, `radius-full`) + existing `Loader`, no new visual language.

## Risks / Trade-offs

- [Risk] F1's `auth.ts` missing/renamed exports break settings build → Mitigation: tasks 4.2/4.3 verify import first; flag rather than duplicate.
- [Risk] Toggle copy/progress pattern rejected by owner → Mitigation: isolated to two components; OQ1/OQ2 must clear before Phase 2.
- [Risk] F13 (`orgAccount.ts`) duplicating sessions/prefs logic → Mitigation: F13 consumes `media.ts` + patterns read-only; no shared-file edits either direction.
- [Trade-off] Two hook files bend the one-file rule, accepted for FB-parallel clarity and F13 reuse.

## Migration Plan

None (new routes only). Rollback = revert the single F2 commit. Archive via `openspec archive frontend-volunteer-account -y` after green verification.

## Open Questions

- **OQ1 (STOP):** Exact upload-progress UI pattern is undefined by DESIGN.md (design shows no upload progress state; V2 §G#4 requires progress). Proposed thin token-driven bar — owner confirm before Phase 2.
- **OQ2 (STOP):** Public-settings toggle copy is undefined by DESIGN.md (new screens, no design folder; only the `role=switch` toggle shape exists in Admin Settings `code.html`). Proposed opt-out "Show X publicly" copy, all default ON — owner confirm before Phase 2.
