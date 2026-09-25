## 1. Open-question gate (do first — no code until answered)

- [x] 1.1 Confirm O1–O2 from design.md with the owner (suspendOnReport default-consequence semantics; notice message bound) and amend specs/design to the answers before implementing. Owner approved both (O1 yes, O2 1000 chars).
- [x] 1.2 Confirm the archived-file edit list (§3 below): six small explicit edits, no standalone-service refactors; hold the critical rule — any further archived touch discovered mid-implementation stops for approval first. Approved; implementation added one routing refinement (all `resolved` calls through the composite) inside the already-approved controller edit — no new files touched.

## 2. Action DTOs and domain constant (new files + two one-line archived additions)

- [x] 2.1 Add `DomainEvents.AdminNotice = 'admin.notice'` in `backend/src/common/constants/domain-events.ts` (archived v1 file; one-line addition).
- [x] 2.2 Create `backend/src/admin/dto/moderation-action.dto.ts`: `ModerationActionDto` (discriminated `type` + per-type payload: `notice { userId: MongoId, message: ≤1000 }`, others payload-less), `AdminNoticeDto` (`message`), whitelist + `forbidNonWhitelisted`.
- [x] 2.3 Extend `ReportStatusDto` in `backend/src/admin/dto/admin-part-b.dto.ts` (archived Session 10 file): optional `action?: ModerationActionDto` (`@ValidateNested`, `@Type`), keeping `status`/`resolution` validation unchanged.
- [x] 2.4 Map `admin.notice` → `system` in `NotificationPrefsService.prefsForType` (archived Session 3 file; one case line + unit coverage in the existing prefs spec).

## 3. Composite service + controller wiring (new service; minimal archived edits)

- [x] 3.1 Create `backend/src/admin/moderation-actions.service.ts` (`@InjectConnection()` + report/opportunity/user/organization models + `StatusTransitionService` + `NotificationsService` + `SettingsService`): compatibility-matrix guard (`INCOMPATIBLE_MODERATION_ACTION` 400), `resolveWithAction` in `session.withTransaction` (report assert + update, consequence assert + update, prefs-checked `createInSession` notice), `suspendOnReport` policy default, `sendNotice` shared by composite + standalone route. No edits to `AdminReportsService`, opportunity/user/org `setStatus` services, whitelists, or schemas.
- [x] 3.2 Register the provider + `NotificationsModule` import in `backend/src/admin/admin.module.ts` (archived file; registration lines only).
- [x] 3.3 Branch `AdminReportsController.resolve` (archived Session 10 file): `resolved` calls (with or without `action`) → `ModerationActionsService.resolveWithAction`; `in_review`/`dismissed` without action → existing `AdminReportsService.resolve` unchanged.
- [x] 3.4 Add `POST /admin/users/:userId/notice` to `AdminUsersController` (archived file; new handler only) delegating to `ModerationActionsService.sendNotice`.

## 4. Tests

- [x] 4.1 Unit (`moderation-actions.service.spec.ts`, memory-server rig): registry/matrix rejections (400, no writes), `resolution`-required and non-`resolved`-status rejections, rollback case (report resolved but consequence 409 → nothing persisted, no history rows), policy-default on/off matrix, notice dedupe (distinct messages persist) and prefs suppression. 15/15 green.
- [x] 4.2 E2E (`test/e2e/moderation-actions.e2e-spec.ts`): report+unpublish atomic (`published→closed`), report+close from `in_progress`, report+suspend (target auth blocked after), report+notice delivered, standalone notice route (incl. `system`-off suppression), suspend regression on plain resolve with flag on/off, non-admin 403 on both routes, history rows for every transition. 12/12 green.

## 5. Verify, archive, commit

- [x] 5.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; from repo root: `openspec validate backend-v2-moderation-actions`. Build green; lint clean; 64 unit suites / 622 tests green; 41 e2e suites / 446 tests green; change valid.
- [ ] 5.2 Confirm touch discipline (only new files + the six approved archived edits; re-verify Session 19 is archived and rebased onto its base before coding) and `openspec status --change backend-v2-moderation-actions`; then `openspec archive backend-v2-moderation-actions -y`.
- [ ] 5.3 Commit locally with `feat(backend-v2-moderation-actions): atomic report resolutions, admin close/unpublish, system notices` (stage only this session's files — tree may hold other sessions' work; never push).
