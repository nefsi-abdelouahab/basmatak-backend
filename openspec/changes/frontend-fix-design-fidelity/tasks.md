## 1. Fonts and theme parity

- [x] 1.1 Diff `tokens.ts`/`tokens.css`/tailwind against DESIGN.md (colors, radii 12/8/6, type scale, shadows, borders) and fix in `tokens.*` only
- [x] 1.2 Wire Inter + IBM Plex Sans Arabic (400/500/600) via `next/font` to the `fontFamily.sans` variable, apply `font-sans` on `<body>`, Plex-first swap for `ar`
- [x] 1.3 Add Playwright font test asserting computed `fontFamily` contains Inter on `/en` and IBM Plex Sans Arabic on `/ar`, plus grep gate for zero hex literals outside `src/theme`

## 2. Public layout split

- [x] 2.1 Add `(public)/layout.tsx` with top navbar + footer and no sidebar/bottom-nav; move `<Shell>` into the authenticated group layout only
- [x] 2.2 Update `shell.spec.ts` home anchors to the public layout and landing title; verify 1440/1100/390 with no sidebar in public DOM

## 3. Landing pilot port

- [x] 3.1 Port `code.html` header/nav, hero with image, philosophy 3-column, and how-it-works steps in DOM order using token classes, `publicOrgs.landing.*` en/ar keys, and logical properties
- [x] 3.2 Port opportunities preview rows from `GET /opportunities` (org embed, verified badge, category label, `OPP-<registryId>`, neutral tag pills) with guest Apply/Save Login-`next` redirect
- [x] 3.3 Port neutral verification showcase, talents grid from `GET /talents` (avatar or neutral fallback, no contact/invite), org CTA, trust strip, final CTA band, and footer
- [x] 3.4 Replace remote images with `public/landing/*` or neutral empty states; remove all Law 12-06/accredited/statutory/ledger/audit/fabricated-code copy and verify by grep

## 4. Structural fidelity gate

- [x] 4.1 Write Playwright harness comparing `file://code.html` vs built `/en` at 1440x900 per section (h1/h2/h3, button, link, card, image counts; computed font/size/weight/color/background/radius/padding/gap; container width/height) with printed text table
- [x] 4.2 Iterate on the landing until only allowed differences remain (neutralized copy, real API data, placeholders, locale strings) and record each explicitly

## 5. Optional pixel signal

- [x] 5.1 Add optional pixelmatch screenshot comparison printing `%` as informational output only, never gating acceptance

## 6. Stop and report

- [x] 6.1 Run build, unit, and landing e2e; print the final diff table with the allowed-difference list for owner review; touch no other screens and push nothing
