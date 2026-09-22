## Why

The core volunteer loop is incomplete: a volunteer can publish (S6) but cannot yet apply to an open position or be accepted into a task, and the inventory's accept/withdraw flows hide two abusable race conditions (F2, F3). This session delivers apply → accept/reject → participate ("My Tasks") so the opportunity lifecycle actually acquires people, and it is the first session to exercise the S1 replica-set transaction rig for real.

## What Changes

- **Applications** (new): volunteer applies (`POST …/applications`), lists/view own applications, org lists applications for an opportunity, org accepts/rejects with reason, volunteer withdraws.
- **Accept is transactional** (F3): inside the run, re-read the opportunity asserting `published` (+ `applicationDeadline >= today` when set), increment the seat with an array-filtered update guarded by `filledCount < requiredCount` (abort→`POSITION_FULL` if it matches nothing), set application `accepted`, insert `task_participants` (`accepted`, or `active` when the opportunity is already `in_progress`), and persist status history + notification inside the same transaction (F4); events are emitted only after commit.
- **Withdraw of an accepted application is transactional** (F2): application→`withdrawn`, matching `task_participants`→`withdrawn` (conditional update), `filledCount` −1.
- **Participations** (new): "My Tasks" list/view, volunteer withdraw (decrements `filledCount`), org remove with reason, org participant listing.
- **Participant machine**: `accepted → active → completed`; `accepted | active → withdrawn | removed`.
- **Events** registered: `application.created|accepted|rejected|withdrawn`, `participation.withdrawn|removed`.

## Capabilities

### New Capabilities
- `applications`: apply, list/view, accept (transactional, F3), reject, withdraw (F2 transactional path), application state machine.
- `participations`: "My Tasks" list/view, withdraw, org remove/reason, participant listing, participant state machine.

### Modified Capabilities
- `opportunities`: the accept transaction's seat increment operates on the existing `positions[].filledCount`, and the ticker's `accepted → active` activation is consumed; the `opportunities` spec already states both — no requirement changes.

## Impact

- Backend: new `backend/src/applications/` and `backend/src/participations/` modules (schemas `applications`, `task_participants` + §3 indexes), `app.module.ts` additive wiring, new `backend/test/applications.e2e-spec.ts`. No new packages or env vars.
- Depends on S6 (opportunities/positions) and S1 (`StatusTransitionService`, Mongo transaction rig, EventEmitter). Notifications (S9) will subscribe to the emitted events.
- Behavior contracts: partial unique `(positionId, volunteerId)` for live applications; seat + deadline guards; transaction rollback leaves no partial rows.