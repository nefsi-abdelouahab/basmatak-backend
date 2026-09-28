## Context

`src/i18n/request.ts` (F0-owned, archived) merges per-area catalogs through hand-maintained imports: two import lines + two spread entries + a comment line per session. Ten areas are wired today (`auth`, `common`, `system`, `opportunityDetails`, `orgOnboarding`, `submitContribution`, `volunteerAccount`, `volunteerHome`, `volunteerTasks`, `volunteerCredentials`); nine more sessions (FD–FF) would extend the same lines. The file runs server-side only (`getRequestConfig` from `next-intl/server`). The project pins Next.js 14.2.18 on webpack (no Turbopack flags), where `require.context` performs build-time static analysis of JSON modules. No `IntlMessages` global augmentation exists and `MessageArea` has no consumers outside `request.ts`.

## Goals / Non-Goals

**Goals:**
- Zero-touch onboarding: a new `messages/<area>/{en,ar}.json` pair is served in both locales with no config edit.
- Byte-identical catalogs for the 10 existing areas (same keys, same values, same locales).
- Fail-fast on unpaired locale files instead of silent missing strings.

**Non-Goals:**
- Renaming any area key or touching any component, hook, route, or catalog content.
- Migrating off webpack or introducing a codegen step / new dependency.

## Decisions

- **webpack `require.context` over `messages/`, not `import.meta.glob`, `fs`, or codegen.** `import.meta.glob` is Vite-only and unavailable under Next.js webpack; `fs` reads depend on `process.cwd()` and add per-request I/O unless cached, and break if the server bundle moves; codegen adds a generated file plus a script step every session must remember. `require.context` is statically analyzable, bundled, and behaves identically in dev and build. Alternative (status quo) rejected: it serializes all remaining sessions onto one file.
- **Area key = kebab-to-camelCase(directory name).** Verified against all 10 wired areas: `volunteer-account` → `volunteerAccount`, `submit-contribution` → `submitContribution`, `volunteer-home` → `volunteerHome`, `volunteer-tasks` → `volunteerTasks`, `volunteer-credentials` → `volunteerCredentials`; `auth`, `common`, `system`, `opportunityDetails`, `orgOnboarding` pass through unchanged. Alternative (explicit dir→key map) rejected: it reintroduces a per-session edit.
- **Unpaired locale file throws at startup.** A missing `ar.json` would otherwise render missing-key fallbacks silently; the throw names the area and the missing file. Alternative (warn-and-continue) rejected: silent degradation is the failure mode being removed.
- **`MessageArea` widens to `string`.** The precise union cannot be known statically anymore; the export has no consumers, so nothing else changes.
- **Structural test is `fs`-based, not `require.context`-based.** Vitest runs on Vite, where `require.context` does not exist; the test asserts the on-disk contract the loader depends on (both locale files per directory, unique derived keys) without importing the loader.

## Risks / Trade-offs

- [Risk] `require.context` is webpack-specific; a future Turbopack migration would need a replacement → Mitigation: the mechanism is isolated to one ~40-line file with a spec pinning the observable contract (auto-merge + key derivation + fail-fast), so a swap stays local.
- [Risk] `require` needs a type shim (`require.context` is untyped under `@types/node`) → Mitigation: narrow local cast, no `any` leakage; lint + build verify.
- [Trade-off] Area keys are now convention-derived rather than explicit; a misnamed directory yields a useless-but-harmless extra key → Mitigation: structural test asserts every directory maps to a unique key, and e2e render specs per session prove each real area resolves.

## Migration Plan

None (drop-in). Rollback = revert the single fix commit. Archive via `openspec archive frontend-fix-i18n-autodiscovery -y` after green verification.

## Open Questions

- None. Key mapping verified against all 10 live areas before implementation.
