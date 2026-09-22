## Context

Session 6 delivered opportunities, positions (seats as `requiredCount`/`filledCount` embedded in positions), the `published` lifecycle, and the S6 `opportunityStartTicker` that flips `accepted` participants to `active`. Session 1 delivered the pieces this session leans on: `StatusTransitionService` (whitelist + status_histories), the in-process EventEmitter with a named event set, and — critically — a MongoDB replica-set test rig for transactions. This session adds the two modules that close the loop: `applications` (apply/accept/reject/withdraw) and `participations` ("My Tasks"). Accept and withdraw-of-accepted are the two real production transactions (inventory §5; F2, F3, F4 in the roadmap).

Constraints from the inventory and roadmap: one active application per `(positionId, volunteerId)`; seats are incremented inside the transaction only; withdrawing an *accepted* application must deactivate the participant row and free the seat atomically; notifications and status histories are written inside the transaction (F4) while `application.*`/`participation.*` events fire only after commit.

## Goals / Non-Goals

**Goals:**
- Apply/lifecycle routes exactly as listed in §2.9 and §2.10.
- The accept transaction with the F3 ordering that removes the TOCTOU window (re-read opportunity, array-filtered guarded `$inc`).
- The withdraw-accepted transaction (F2) that keeps `applications`, `task_participants`, `filledCount` consistent.
- Correct state machines and index-backed dedupe.
- Tests on the replica-set rig proving rollback and no double-booking.

**Non-Goals:**
- Submissions/verification/stats (S10/S11), notifications module (S9 — events are only emitted here), admin views, any volunteer-facing dashboard work (S4), media.
- Freeing a seat on *org removal*: §2.10 only states withdraw decrements `filledCount`; removal is a personnel action and leaves the seat allocated.
- Any new package, env var, or route beyond §2.9/§2.10.

## Decisions

**D1 — Two modules, shared owning-module models.** `backend/src/applications/` owns the `Application` model; `backend/src/participations/` owns `TaskParticipant`. Both read/write the `opportunities` document (positions, `filledCount`, status, deadline) through the `OpportunitiesModule`'s models (`opportunityModel` + a small read API), mirroring what S7 needs without re-implementing opportunity queries. The rules that belong to the opportunity (seats, published, deadline) are treated as the opportunities module's invariants but enforced from the application service inside the transaction.

**D2 — Accept transaction ordering (F3).** Inside `session.withTransaction`:
1. `role: 'published'` filter on the re-read — read the opportunity again and require `status === 'published'` and (when set) `applicationDeadline >= startOfToday`; else abort (`APPLICATIONS_CLOSED` / `APPLICATION_DEADLINE_PASSED`, both 410). Read *after* taking the session so the guard sees committed state.
2. Increment the seat atomically with an array-filtered update anchored on the opportunity's `_id` **and** position `_id`:
   `updateOne({ _id: opportunityId, 'positions._id': positionId, status: 'published', 'positions.filledCount': { $lt: ... } }, { $inc: { 'positions.$.filledCount': 1 } })` — since `$` matches the same element the filter locked, the `filledCount < requiredCount` guard and the increment touch one element; a `matchedCount === 0` means the position filled (or opportunity left `published`) and aborts with `POSITION_FULL` (409).
3. Set `application.status = 'accepted'` (pre-checked `pending`).
4. Insert `TaskParticipant` with status `accepted`, or `active` when the re-read opportunity is already `in_progress`.
5. Write status history (via `StatusTransitionService` with a passed session) and the in-app notification row (injected notification repository conforming to F4 — the notifications module is S9, so this is the same repository seam pattern: an inert default is replaced in S9).
6. Commit; only then `EventEmitter.emit('application.accepted', ...)`. Alternative considered — two-step "reserve then confirm" — rejected because it adds a transient state the schema doesn't have and complicates rollback.

**D3 — Withdraw-accepted transaction (F2).** For an `accepted` application: same session pattern, `application → withdrawn`; `TaskParticipant.updateOne({ applicationId }, { status: 'withdrawn' })` guarded on `status: { $in: ['accepted','active'] }` (idempotent — both sides in one txn anyway); `$inc positions.$.filledCount` by −1 with the same array-filtered anchoring; status history + notification in-transaction; emit `application.withdrawn` + `participation.withdrawn` after commit. `pending → withdrawn` stays a plain update (no transaction needed — nothing else to keep consistent), also emitting `application.withdrawn`.

**D4 — Dedupe via the partial unique index.** `applications` gets `{ positionId: 1, volunteerId: 1 }` unique with `partialFilterExpression: { status: { $in: ['pending','accepted'] } }` (inventory §3). A raw `E11000` on apply is caught and remapped to 409 `DUPLICATE_APPLICATION`. Alternative — a service-level find-then-insert with app-level locking — rejected: the partial index is authoritative, race-proof, and already mandated.

**D5 — Org/volunteer identity from tokens via seams.** The volunteer `userId` comes from the auth token; the owning organization `organizationId` for org routes comes from the S5 `OrganizationLookup` seam (token user → org), so this module does not re-implement account → org resolution. Opportunity ownership checks (`organizationId` match) gate every org action.

**D6 — The 404-not-403 visibility convention.** `GET /applications/:applicationId`, `GET /participations/:participationId`, and the org opportunity appliciations/participants listings follow inventory §6: non-owners see 404 (not 403), so existence is not leaked.

**D7 — Events and the S9 handoff.** The module emits the seven named events (`application.created|accepted|rejected|withdrawn`, `participation.withdrawn|removed`) on a global bus; S9 registers handlers. Transactional notifications are written direct-to-Mongo inside the transaction and must NOT also cross the bus (S9's dedupe rule), so this session's in-transaction writes are the only notification path.

**D8 — `removed` does not free the seat.** Per §2.10 (only withdraw decrements), org remove transitions `accepted|active → removed` and stores `reason`, leaving `filledCount` alone. Rationale: org removal is a personnel correction; the org can reject/withdraw-and-reopen via positions instead. Noted as a deliberate literal reading of the inventory; revisit in P3 if the PM wants the seat freed.

## Risks / Trade-offs

- **Array-filtered `$inc` on a shared document kills throughput on hot opportunities.** A single position is updated serially per transaction; acceptable for MVP scale (inventory §10 heat limits). → Keep transactions short; no read-modify-write outside the transaction.
- **Mongoose models must accept a `ClientSession` everywhere in a transaction.** Missing a `session` on one write silently executes *outside* the transaction, breaking rollback. → All transactional writes go through injected repositories whose methods take an optional `ClientSession` and are unit-tested with a deliberately failing step to prove rollback.
- **`filledCount` initially guarded at apply time AND at accept time.** The apply-time check is advisory UX (cheap 409); only the in-transaction guard is authoritative. → Duplicate checks are cheap; correctness rests on D2.
- **Sibling session (S8 media) running against the same repo.** The accept path inserts notifications referencing media-free fields only, so no interference; `app.module.ts` wiring must stay additive (re-read before edit).
- **Removal-leaves-seat behavior may surprise.** → Explicitly documented in D8 and in the participations spec scenario.

## Migration Plan

No schema migration: two new collections (`applications`, `task_participants`) with brand-new indexes on first use; no existing data touched. Deployment is the normal build/test/e2e pass followed by the session commit. Rollback: revert the one commit; no pre-existing behavior depended on these collections.

## Open Questions

- None blocking. Post-implementation it is worth confirming D8 (removal not freeing the seat) with the product owner before P3.