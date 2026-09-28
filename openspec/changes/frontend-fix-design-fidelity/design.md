## Context

`design/...Public Landing Page/code.html` (48 KB, 9 sections, Tailwind-CDN classes) plus `design/system-design.md` / per-screen `DESIGN.md` are the visual source of truth; `screen.png` is never consulted. Current state: `[locale]/layout.tsx` wraps every route in `<Shell>` (navbar + sidebar + bottom nav, `max-w-6xl`), so `/en` renders inside the authenticated 3-column shell; `PublicLandingPage.tsx` only has org search, opportunity filters, and raw lists; `getComputedStyle(body).fontFamily` falls back to serif because the `next/font` variables are set on `<html>` but `font-sans` is never applied to `<body>` and `ar` never swaps to Plex (Plex also lacks weight 600 used by headings); tokens drift from DESIGN.md (`ink #0F172A` vs `#111827`, radii naming, missing type/shadow/border scale). Constraints: 4 mandates (THEME single tokens, I18N no hardcoded strings + logical properties, API ACCESS single axios client + typed fns + Query hooks, RESPONSIVE 1440/1100/390), `docs/DESIGN_BACKEND_RECONCILIATION_V2.md` forbidden copy (Law 12-06, accredited, statutory, ledger/audit refs, fabricated codes), never push, stop after landing diff table.

## Goals / Non-Goals

**Goals:**
- Body font resolves to Inter (`en`) / IBM Plex Sans Arabic (`ar`) via the Tailwind `fontFamily.sans` variable, proven by a Playwright computed-style test.
- Token parity with DESIGN.md for colors, radii 12/8/6, type scale, shadows, borders.
- Public routes render top navbar + footer with no sidebar; authenticated screens keep the 3-column shell.
- Landing pilot ports `code.html` in DOM order with tokens, `en`/`ar` keys, API data, `public/` images or neutral empty states, and forbidden copy removed.
- A repeatable structural fidelity gate (counts + computed styles + boxes) prints a reviewable diff table.

**Non-Goals:**
- Any screen besides the landing; visual pixel-perfectness as acceptance (pixelmatch is secondary signal only); backend/API changes; new image procurement beyond neutral placeholders.

## Decisions

- **Fonts via `next/font` + body-bound sans + `:lang(ar)` swap.** Keep `Inter`/`IBM_Plex_Sans_Arabic` variables, add missing weight 600, keep `tailwind.config fontFamily.sans` on those vars, add `font-sans` to `<body>`, and swap the stack for `ar` (Plex first) so computed `fontFamily` contains the expected face per locale. Alternative (plain `<link>` Google Fonts): rejected — FOUT, offline-build fragility, and no variable binding.
- **Token parity from `tokens.ts` outward.** Diff `tokens.ts`/`tokens.css`/tailwind against DESIGN.md frontmatter and body copy (`primary #6D28D9`, hover `#5B21B6`, canvas `#F8FAFC`, ink `#111827`, muted `#64748B`, borders `#E2E8F0`/`#F1F5F9`, status `#16A34A`/`#F59E0B`/`#DC2626`, radii 12/8/6, display-to-label scale, hairline/raised/modal shadows); fix in `tokens.*` only and let components inherit. Alternative (per-component hex edits): rejected — violates THEME and the grep gate.
- **Route-group layout split, not conditional Shell.** Add `(public)/layout.tsx` (`PublicNavbar` + `{children}` + `PublicFooter`, full-width sections, `max-w-7xl` container) and move `<Shell>` out of `[locale]/layout.tsx` into the authenticated group layout so public DOM never contains sidebar/bottom-nav nodes. Alternative (route check inside `Shell`): rejected — sidebar stays in DOM and breaks section counts.
- **Section-by-section landing port with a mapping table.** Order: header/nav, hero + image, philosophy 3-col, how-it-works 5 steps, opportunities preview rows (API `GET /opportunities` + org/category embeds, `OPP-<registryId>`, tags as neutral pills), verification showcase rebuilt neutral (title/org/date/`EXP-<registryId>`/"Verified" only), talents grid (API `GET /talents`, avatar or initial-letter neutral block), org CTA, trust 5-col, final CTA, footer. Hardcoded `surface-container-*`/`on-surface` classes map to theme tokens; every string becomes `publicOrgs.landing.*` en+ar; remote `googleusercontent` images become `public/landing/*` or the neutral empty state; Material Symbols become inline SVG/text (no external icon font); shared `Button/Card/Pill/Input/Select/Loader/Empty` consumed unchanged. Forbidden copy (Law 12-06, accredited, statutory, audit/logbook/ledger refs, `#DZ-*`/`TC-*` codes) is deleted, not reworded, and each deletion is listed as an allowed difference.
- **Structural fidelity gate as acceptance, pixelmatch as secondary.** Playwright at 1440x900 loads `file://code.html` and `/en` (+`/ar` smoke), selects per-section roots, and compares h1/h2/h3/button/link/card/image counts, computed `font-family/size/weight/color/background/border-radius/padding/gap`, and container `width/height`, printing a text table and failing on unallowed diffs. Optional pixelmatch `%` is printed but never gates. Alternative (screenshot-only review): rejected — unreviewable without images and banned by the task.

## Risks / Trade-offs

- [Risk] `code.html` remote images have no redistributable asset → Mitigation: neutral `public/` placeholder or empty state; list as allowed difference.
- [Risk] Plex Arabic metrics shift line boxes vs Inter → Mitigation: identical type-scale tokens; box diffs from font swap alone are listed, not fixed by hacking sizes.
- [Risk] `shell.spec.ts` pins the old landing heading/shell nodes → Mitigation: update companion assertions to the new public layout + landing title in the same change.
- [Risk] Tailwind-CDN class names in `code.html` predate v3 tokens → Mitigation: mapping table normalizes to token utilities; unmapped values fail the grep gate rather than shipping hex.

## Migration Plan

Frontend-only change, no backend or data migration. Land order: tokens → fonts + test → `(public)` layout → landing port + catalogs → fidelity harness → iterate to allowed-only diffs. Rollback is a plain revert of the change. No feature flag needed; other screens are untouched until the owner reviews the diff table.

## Open Questions

- Hero/org-section imagery: neutral placeholder vs owner-supplied `public/` asset — default to neutral unless the owner provides files.
- Footer/nav link targets: point at real public routes where they exist (`/opportunities`, `/talents`, auth entries), `#` nowhere in shipped code — confirm dead-link policy for About/How-Verification routes.
