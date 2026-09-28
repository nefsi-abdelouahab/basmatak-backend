## Why

The landing route renders serif fallback text inside the authenticated 3-column shell with only search forms and raw lists. The designed public page (hero, how-it-works, opportunity/talent cards, CTA band, footer) from `design/...Public Landing Page/code.html` plus `design/system-design.md` is missing, and cards/pills/buttons ignore theme tokens.

## What Changes

- Fonts/theme: Inter + IBM Plex Sans Arabic via `next/font` bound to the CSS variable consumed by `fontFamily.sans`, applied on `<body>` with `ar` swap; Playwright asserts computed `fontFamily` per locale; diff and fix token mismatches (colors, radii 12/8/6, type scale, shadows, borders) against DESIGN.md.
- Layout: public routes render under a `(public)` layout (top navbar + footer, no sidebar); the 3-column shell stays only for authenticated screens.
- Landing pilot: port `code.html` section-by-section in DOM order, mapping classes to theme tokens, `en`/`ar` keys, API data (`GET /opportunities`, `GET /organizations`, `GET /talents`), `public/` images or neutral empty states; strip copy forbidden by `docs/DESIGN_BACKEND_RECONCILIATION_V2.md` (Law 12-06, accredited, statutory, ledger/audit refs).
- Fidelity gate: Playwright structural test (`file://` code.html vs built route, 1440x900) comparing per-section element counts, computed styles, and container boxes as a printed diff table; optional pixelmatch % as secondary signal only.
- Stop after the landing diff table; other screens untouched.

## Capabilities

### New Capabilities

- `landing-structural-fidelity`: per-section structural/computed-style diff harness and allowed-difference list for the landing pilot.

### Modified Capabilities

- `frontend-theme`: font binding/swap on body plus token parity with DESIGN.md.
- `frontend-shell`: public `(public)` layout vs authenticated 3-column shell.
- `public-landing`: full section port with token/i18n/API/image rules and forbidden-copy removal.

## Impact

- Frontend only: `src/app/[locale]/`, `src/components/shell/`, `src/theme/`, `messages/public-orgs/`, `e2e/`, `public/`. No backend, API, or spec-scope changes beyond the listed deltas. No push.
