## 1. Schemas and infrastructure

- [x] 1.1 Create `backend/src/applications/` module: `Application` schema + model with `opportunityId`, `positionId`, `volunteerId`, `organizationId`, `status` (`pending | accepted | rejected | withdrawn`, default `pending`), optional `message`, timestamps; indexes incl. partial unique `(positionId, volunteerId)` where `status in (pending, accepted)` plus `(opportunityId, status)` and `(volunteerId, status)`; export via module providers.
- [x] 1.2 Create `backend/src/participations/` module: `TaskParticipant` schema + model with `opportunityId`, `positionId`, `applicationId`, `organizationId`, `volunteerId`, `status` (`accepted | active | completed | withdrawn | removed`, default `accepted`), optional `reason`, timestamps; indexes unique `applicationId`, `(volunteerId, status)`, `(opportunityId, positionId)`.
- [x] 1.3 Add both module imports plus expected providers to `backend/src/app.module.ts` additively (re-read file first; two lines matching existing style; never reorder/reformat existing lines).
- [x] 1.4 Register the applications and task_participants state-machine whitelists in `StatusTransitionService`: applications `pending → accepted|rejected|withdrawn`, `accepted → withdrawn`; participants `accepted|active → withdrawn|removed`, `accepted → active`, `active → completed` (completed transition consumed by S11; registered now).
- [x] 1.5 Provide the F4 notification seam (injectable notification repository written inside transactions) with an inert default; transactional flows use it so S9 can swap a real repository.
- [x] 1.6 Register the module event names on the shared bus (`application.created`, `application.accepted`, `application.rejected`, `application.withdrawn`, `participation.withdrawn`, `participation.removed`).

## 2. Apply and application lifecycle

- [x] 2.1 Implement `POST /opportunities/:opportunityId/positions/:positionId/applications`: volunteer role; email-verified gate (A10, 403 `EMAIL_NOT_VERIFIED`); opportunity exists (404) and `published` (410 `APPLICATIONS_CLOSED`); `applicationDeadline` future-or-today (410 `APPLICATION_DEADLINE_PASSED`); position exists (404) and `filledCount < requiredCount` (409 `POSITION_FULL` advisory); catch `E11000` partial-index duplicate → 409 `DUPLICATE_APPLICATION`; create `pending`, emit `application.created`.
- [x] 2.2 Implement `GET /applications/me?status=` (own rows, cursor pagination default 20 max 50) and `GET /applications/:applicationId` (own volunteer or owning org else 404).
- [x] 2.3 Implement `GET /opportunities/:opportunityId/applications?positionId=&status=` (owning org only, else 404; cursor pagination).

## 3. Transactional accept

- [x] 3.1 Implement `POST /applications/:applicationId/accept` (owning org) with the F3 transaction: re-read opportunity in-session asserting `published` + deadline; array-filtered guarded `$inc positions.$.filledCount` (`matchedCount 0` → 409 `POSITION_FULL`); application `pending → accepted`; insert `TaskParticipant` (`accepted`, or `active` when opportunity already `in_progress`); write status history + notification inside the transaction; commit then emit `application.accepted`.
- [x] 3.2 Unit/transaction tests on the replica-set rig: accept fills one seat + exactly one participant; concurrent `Promise.all` accepts on the last seat leave exactly one winner with `filledCount === requiredCount`; deliberately failing step rolls back all writes (no partial rows); non-`pending` accept → 409 `INVALID_APPLICATION_STATUS`; opportunity re-read no longer `published` → 410 abort.

## 4. Reject and withdraw

- [x] 4.1 Implement `POST /applications/:applicationId/reject` (owning org, body `{ reason }`): `pending → rejected`, store reason, emit `application.rejected`; non-`pending` → 409 `INVALID_APPLICATION_STATUS`.
- [x] 4.2 Implement `POST /applications/:applicationId/withdraw`: `pending → withdrawn` plain update + `application.withdrawn`; `accepted → withdrawn` via the F2 transaction (application `withdrawn`, `TaskParticipant.updateOne` conditional `accepted|active → withdrawn` via unique applicationId, `positions.$.filledCount` −1, history + notification in-transaction, then emit `application.withdrawn` + `participation.withdrawn`); already `withdrawn`/`rejected` → 409 `INVALID_APPLICATION_STATUS`; rollback test (failing step leaves accepted + participant + seat intact).

## 5. Participations

- [x] 5.1 Implement `GET /participations/me?status=` (own rows, cursor pagination) and `GET /participations/:participationId` (own volunteer or owning org else 404).
- [x] 5.2 Implement `POST /participations/:participationId/withdraw` (owning volunteer): `accepted|active → withdrawn`, decrement position `filledCount` by 1, emit `participation.withdrawn`; `completed` → 409 `INVALID_PARTICIPATION_STATUS`.
- [x] 5.3 Implement `POST /participations/:participationId/remove` (owning org, body `{ reason }`): `accepted|active → removed` with reason, `filledCount` unchanged, emit `participation.removed`; terminal statuses → 409 `INVALID_PARTICIPATION_STATUS`.
- [x] 5.4 Implement `GET /opportunities/:opportunityId/participants` (owning org, statuses `accepted|active`, cursor pagination, else 404).

## 6. E2E and verification

- [x] 6.1 Write `backend/test/applications.e2e-spec.ts` covering: apply success; duplicate live apply → 409; deadline-passed apply → 410; unverified-email apply → 403 (probe with `EMAIL_VERIFICATION_REQUIRED`); accept fills seat + creates participant; `in_progress` opportunity accept creates `active`; second accept on full position → `POSITION_FULL`; withdraw-accepted frees seat + participant `withdrawn`; pending-withdraw; org reject with reason; participations list/filter/view/withdraw; org remove with reason; participants listing; foreign-access 404s.
- [x] 6.2 From `/backend` run `npm run build`, `npm run lint`, `npm test`, and `npx jest --config ./test/jest-e2e.json applications.e2e-spec`; fix every failure until green (leave sibling-owned suites alone per parallel-safety), then `npm run test:e2e` full pass.
- [x] 6.3 From repo root run `openspec validate applications-and-participation` and `openspec status --change applications-and-participation` (all artifacts done).