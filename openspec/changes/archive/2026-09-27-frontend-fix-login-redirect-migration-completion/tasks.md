## 1. Normalize guard next props (26 one-line edits, locale-less only)

- [x] 1.1 Admin guards: `admin/volunteers/page.tsx`, `admin/verifications/page.tsx`, `admin/organizations/page.tsx`, `admin/opportunities/page.tsx`, `AdminSettingsPage.tsx:327`, `AdminReportsPage.tsx:585` — `next={`/${locale}/…`}` → `next={`/…`}`.
- [x] 1.2 Volunteer guards: `VolunteerDashboardPage:96`, `VolunteerSettingsPage:14`, `ExperiencesPage:91`, `PortfolioPage:228`, `VolunteerProfilePage:50`, `VolunteerTasksPage:66`, `VolunteerTaskDetailPage:18`, `VolunteerApplicationsPage:74`, `VolunteerApplicationDetailPage:21`.
- [x] 1.3 Org guards: `OrgSettingsPage:15`, `OrgApplicationsPage:71`, `OrgApplicationDetailPage:18`, `OrgProfilePage:10`, `OrgExperiencesPage:158`, `OrgSubmissionDetailPage:18`, `OrgParticipantsPage:93`, `OrgOpportunitiesPage:277`, `OpportunityEditor:936`, `OpportunityEditor:944`, `OrgContributionsPage:82`.

## 2. Normalize client next literals (6 one-line edits)

- [x] 2.1 `AdminDashboardPage:490` (`/admin/dashboard`), `OrgDashboardPage:343` (`/org/dashboard`), `VolunteerTalentsPage:128` (`/volunteer/talents`), `VolunteerOpportunitiesPage:150` (`/volunteer/opportunities`), `OpportunityDetailsPage:165` (`/volunteer/opportunities/${idOrSlug}`), `SubmitContributionPage:120` (`/volunteer/tasks/${participationId}/submit`) — drop the `/${locale}` prefix, keep the rest byte-identical.

## 3. Verify to 0 failures

- [x] 3.1 `npm run build`, `npm run lint`, `npm test` green from `/frontend`; confirm no new `tsc` diagnostics and no unused-`locale` fallout.
- [x] 3.2 Full e2e in settled-tree chunks (as F18 did) with before/after counts; every chunk 0 failures (isolate-rerun anything flaky to classify; fix only in-scope literals).
- [x] 3.3 `openspec validate frontend-fix-login-redirect-migration-completion` clean.

## 4. Archive + commit (only after 3.x is 0-failure green)

- [ ] 4.1 `openspec archive frontend-fix-login-redirect-migration-completion -y`, then commit **twice** (frontend leaf-paths + root artifacts only, message `fix(login-redirect): normalize remaining locale-prefixed next values`). Never push, never amend, never branch.
