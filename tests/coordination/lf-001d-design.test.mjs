import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LeaseStore, scopesOverlap } from '../../scripts/autopilot/lease-store.mjs';
import { BudgetLedger } from '../../scripts/autopilot/budget-ledger.mjs';
import { AuthorizationLedger, verifyOwnerIdentityFake } from '../../scripts/autopilot/authorization-ledger.mjs';
import { evaluateAdmissionChecks, admitTask, reconcilePendingAdmission } from '../../scripts/autopilot/admission-validator.mjs';
import { invokeProvider } from '../../scripts/autopilot/provider-invocation.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('../../docs/autopilot/fixtures/lf-001d/baseline.json', import.meta.url), 'utf8'));

function clone(value) { return JSON.parse(JSON.stringify(value)); }

/** A fresh, valid baseline scenario; callers mutate the returned pieces for a single isolated change. */
function scenario() {
  const f = clone(FIXTURE);
  return { authorization: f.authorization, request: f.request, sources: f.sources, now: f.now };
}

function freshLedgers({ authorization, hardLimitCents = 1000 } = {}) {
  const leaseStore = new LeaseStore();
  const budgetLedger = new BudgetLedger({ hardLimitCents });
  const authorizationLedger = new AuthorizationLedger();
  if (authorization) authorizationLedger.register(authorization);
  return { leaseStore, budgetLedger, authorizationLedger };
}

/** A lease and a matching budget reservation, ready for invokeProvider (which requires both). */
function acquireLeaseAndBudget({ taskId = 'LF-100', scopeFiles = ['docs/specs/LF-100.md'], hardLimitCents = 1000, estimatedCostCents = 0 } = {}) {
  const leaseStore = new LeaseStore();
  const budgetLedger = new BudgetLedger({ hardLimitCents });
  const lease = leaseStore.acquire({ taskId, scopeFiles });
  budgetLedger.reserve({ taskId, fenceToken: lease.fenceToken, estimatedCostCents });
  return { leaseStore, budgetLedger, lease, taskId };
}

/** Awaits long enough for any pending microtask/macrotask (e.g. a swallowed promise rejection) to settle. */
async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Lease Store: fencing, overlap exclusivity, confirmed rejection vs unknown_outcome
// ---------------------------------------------------------------------------

test('scopesOverlap reuses the same path/glob criterion as check-coordination.mjs', () => {
  assert.equal(scopesOverlap(['docs/a.md'], ['docs/a.md']), true);
  assert.equal(scopesOverlap(['docs/**'], ['docs/a.md']), true);
  assert.equal(scopesOverlap(['docs/a.md'], ['docs/b.md']), false);
});

test('acquire rejects a lease overlapping another task scope_files, not just the same task', () => {
  const store = new LeaseStore();
  const first = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.equal(first.ok, true);
  const second = store.acquire({ taskId: 'LF-101', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'lease_overlap');
});

test('acquire rejects a second concurrent request for non-overlapping scope only if same task key reused', () => {
  const store = new LeaseStore();
  const a = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  const b = store.acquire({ taskId: 'LF-101', scopeFiles: ['docs/specs/LF-101.md'] });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.fenceToken, b.fenceToken);
});

test('regression: acquire rejects a second lease for a task that still holds one, even over non-overlapping scope_files', () => {
  const store = new LeaseStore();
  const first = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.equal(first.ok, true);
  // Different, non-overlapping paths: the old code's overlap check alone would have let this through
  // and silently overwritten the first lease, losing its protection on docs/specs/LF-100.md.
  const second = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100-OTHER.md'] });
  assert.deepEqual(second, { confirmed: true, ok: false, reason: 'task_already_has_lease' });
});

test('regression: a rejected second acquisition never modifies the original lease', () => {
  const store = new LeaseStore();
  const first = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100-OTHER.md'] });
  const snapshot = store.inspect('LF-100');
  assert.equal(snapshot.fenceToken, first.fenceToken);
  assert.deepEqual(snapshot.scopeFiles, ['docs/specs/LF-100.md']);
  // The original scope is still exclusively protected: a third party cannot acquire over it either.
  const third = store.acquire({ taskId: 'LF-101', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.deepEqual(third, { confirmed: true, ok: false, reason: 'lease_overlap' });
});

test('regression: once a lease is properly invalidated and released, a fresh acquisition for the same task is allowed', () => {
  const store = new LeaseStore();
  const first = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  store.invalidate({ taskId: 'LF-100', fenceToken: first.fenceToken });
  store.release({ taskId: 'LF-100', fenceToken: first.fenceToken });
  const second = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100-OTHER.md'] });
  assert.equal(second.ok, true);
  assert.notEqual(second.fenceToken, first.fenceToken);
});

test('confirmed rejection: release requires the live fencing token, never a stale one, and only after invalidation', () => {
  const store = new LeaseStore();
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  const releasedStale = store.release({ taskId: 'LF-100', fenceToken: lease.fenceToken + 1 });
  assert.deepEqual(releasedStale, { confirmed: true, ok: false, reason: 'fence_token_mismatch' });
  // The right token alone is still not enough: release refuses before a confirmed invalidation.
  const releasedUninvalidated = store.release({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.deepEqual(releasedUninvalidated, { confirmed: true, ok: false, reason: 'not_invalidated' });
  store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  const real = store.release({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(real.ok, true);
});

test('fencing: invalidate before release/reassign; the mere passage of time never releases a lease by itself', () => {
  const store = new LeaseStore();
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  // No elapsed-time API exists at all: a reconciliation sweep must explicitly invalidate first.
  const invalidated = store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(invalidated.ok, true);
  const released = store.release({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(released.ok, true);
});

test('delayed process: a token invalidated by recovery can never be invalidated or released twice, and never registers an attempt afterward', () => {
  const store = new LeaseStore();
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  const delayedAttempt = store.registerAttempt({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.deepEqual(delayedAttempt, { confirmed: true, ok: false, reason: 'fence_token_invalid' });
});

test('race: invalidation first makes the competing attempt registration fail (at most one wins)', () => {
  const store = new LeaseStore();
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  const invalidate = store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  const attempt = store.registerAttempt({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(invalidate.ok, true);
  assert.equal(attempt.ok, false);
});

test('race: attempt registration first makes the competing invalidation fail (never silently invalidated underneath an in-flight send)', () => {
  const store = new LeaseStore();
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  const attempt = store.registerAttempt({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  const invalidate = store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(attempt.ok, true);
  assert.deepEqual(invalidate, { confirmed: true, ok: false, reason: 'attempt_already_registered' });
});

test('regression: exact reproduction — responseLost, then release, then a second lease, must not allow a second send', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  let sends = 0;
  const first = invokeProvider({
    leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken,
    send: () => { sends++; return { ok: true }; }, responseLost: true,
  });
  assert.equal(first.outcome, 'unknown_outcome');
  assert.equal(sends, 1);
  // The old code let this succeed outright, which then let a second lease and a second send through.
  const released = store.release({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.deepEqual(released, { confirmed: true, ok: false, reason: 'attempt_already_registered' });
  // invalidate is refused too, for the same reason, so there is no way around release being refused.
  const invalidated = store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.deepEqual(invalidated, { confirmed: true, ok: false, reason: 'attempt_already_registered' });
  // With the lease still live, a second lease for the same (or any overlapping) scope is rejected.
  const secondLease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.equal(secondLease.ok, false);
  const secondAttempt = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1);
});

test('regression: a stale token from before a legitimate release is rejected by every operation afterward', () => {
  const store = new LeaseStore();
  const first = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  store.invalidate({ taskId: 'LF-100', fenceToken: first.fenceToken });
  store.release({ taskId: 'LF-100', fenceToken: first.fenceToken });
  const second = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  assert.equal(second.ok, true);
  assert.notEqual(second.fenceToken, first.fenceToken);
  // The old (now stale) token can no longer invalidate, release or register an attempt.
  assert.deepEqual(store.invalidate({ taskId: 'LF-100', fenceToken: first.fenceToken }), { confirmed: true, ok: false, reason: 'unknown_or_stale_lease' });
  assert.deepEqual(store.release({ taskId: 'LF-100', fenceToken: first.fenceToken }), { confirmed: true, ok: false, reason: 'fence_token_mismatch' });
  assert.deepEqual(store.registerAttempt({ taskId: 'LF-100', fenceToken: first.fenceToken }), { confirmed: true, ok: false, reason: 'fence_token_invalid' });
});

test('restart with partial state: inspect gives a confirmed, read-only snapshot, never a guess', () => {
  const store = new LeaseStore();
  assert.equal(store.inspect('LF-100'), null);
  const lease = store.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  const snapshot = store.inspect('LF-100');
  assert.equal(snapshot.fenceToken, lease.fenceToken);
  assert.equal(snapshot.invalidated, false);
  assert.equal(snapshot.attemptRegistered, false);
});

// ---------------------------------------------------------------------------
// Budget Ledger
// ---------------------------------------------------------------------------

test('null, zero or negative hard_limit_cents is never "unlimited": every reservation is denied', () => {
  for (const hardLimitCents of [null, undefined, 0, -1]) {
    const ledger = new BudgetLedger({ hardLimitCents });
    assert.equal(ledger.canReserve(0), false);
    const result = ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 0 });
    assert.deepEqual(result, { confirmed: true, ok: false, reason: 'budget_not_available' });
  }
});

test('two simultaneous reservations that together exceed the limit: the second fails', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  const first = ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 60 });
  const second = ledger.reserve({ taskId: 'LF-101', fenceToken: 2, estimatedCostCents: 60 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'budget_not_available');
});

test('unknown observed cost blocks every new reservation and is never treated as zero', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 10 });
  ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 'unknown' });
  assert.equal(ledger.canReserve(1), false);
  const blocked = ledger.reserve({ taskId: 'LF-101', fenceToken: 2, estimatedCostCents: 1 });
  assert.equal(blocked.ok, false);
});

test('release requires the fencing token that reserved the budget', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  const reserved = ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 10 });
  assert.equal(reserved.ok, true);
  assert.deepEqual(ledger.release({ taskId: 'LF-100', fenceToken: 2 }), { confirmed: true, ok: false, reason: 'fence_token_mismatch' });
  assert.equal(ledger.release({ taskId: 'LF-100', fenceToken: 1 }).ok, true);
});

test('regression: exact reproduction — reserve 100, consume 100, release, then a second 100 reservation must fail', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  const reserved = ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 100 });
  assert.equal(reserved.ok, true);
  const recorded = ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 100 });
  assert.deepEqual(recorded, { confirmed: true, ok: true, unknown: false, consumedCents: 100 });
  // The old code let this "release" the already-consumed 100 back to availability.
  const released = ledger.release({ taskId: 'LF-100', fenceToken: 1 });
  assert.deepEqual(released, { confirmed: true, ok: false, reason: 'no_reservation' });
  const secondReserve = ledger.reserve({ taskId: 'LF-101', fenceToken: 2, estimatedCostCents: 100 });
  assert.deepEqual(secondReserve, { confirmed: true, ok: false, reason: 'budget_not_available' });
  assert.equal(ledger.inspect('LF-100').totalConsumedCents, 100);
});

test('full consumption permanently removes the entire reservation from availability', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 100 });
  ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 100 });
  assert.equal(ledger.canReserve(1), false);
});

test('partial consumption returns only the unconsumed difference to availability', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 100 });
  const recorded = ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 60 });
  assert.deepEqual(recorded, { confirmed: true, ok: true, unknown: false, consumedCents: 60 });
  assert.equal(ledger.canReserve(40), true);
  assert.equal(ledger.canReserve(41), false);
  assert.equal(ledger.inspect('LF-100').totalConsumedCents, 60);
});

test('unknown cost stays pending and blocked, then a later real reconciliation finalizes it exactly once', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 100 });
  const unknown = ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 'unknown' });
  assert.deepEqual(unknown, { confirmed: true, ok: true, unknown: true });
  // The reservation is neither released nor finalized while unknown; it stays blocked.
  assert.deepEqual(ledger.release({ taskId: 'LF-100', fenceToken: 1 }), { confirmed: true, ok: false, reason: 'cost_unreconciled' });
  assert.equal(ledger.canReserve(1), false, 'an unresolved cost blocks every other reservation too');
  // A later, repeated reconciliation with a real number finalizes it exactly once.
  const resolved = ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 70 });
  assert.deepEqual(resolved, { confirmed: true, ok: true, unknown: false, consumedCents: 70 });
  assert.equal(ledger.canReserve(30), true);
  assert.equal(ledger.canReserve(31), false);
  // Reconciling the same, already-finalized task again is refused: no duplicate charge.
  assert.throws(() => ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 10 }));
  assert.equal(ledger.inspect('LF-100').totalConsumedCents, 70);
});

test('reconciling with a real number twice in a row never doubles the charge', () => {
  const ledger = new BudgetLedger({ hardLimitCents: 100 });
  ledger.reserve({ taskId: 'LF-100', fenceToken: 1, estimatedCostCents: 100 });
  ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 50 });
  assert.throws(() => ledger.recordObservedCost({ taskId: 'LF-100', fenceToken: 1, costCentsOrUnknown: 50 }));
  assert.equal(ledger.inspect('LF-100').totalConsumedCents, 50);
  assert.equal(ledger.canReserve(50), true);
  assert.equal(ledger.canReserve(51), false);
});

// ---------------------------------------------------------------------------
// Authorization Ledger
// ---------------------------------------------------------------------------

test('verifyOwnerIdentityFake is explicitly synthetic and never a real identity check', () => {
  assert.equal(verifyOwnerIdentityFake('AUTH-1', 'OWNER-PROOF-FAKE:AUTH-1'), true);
  assert.equal(verifyOwnerIdentityFake('AUTH-1', 'OWNER-PROOF-FAKE:AUTH-2'), false);
  assert.equal(verifyOwnerIdentityFake('AUTH-1', 'anything-else'), false);
});

test('validate: expired, revoked, reused and a failing synthetic identity proof each deny independently', () => {
  const base = clone(FIXTURE.authorization);
  const now = FIXTURE.now;

  const expired = new AuthorizationLedger();
  expired.register({ ...base, expiresAt: now - 1 });
  assert.equal(expired.validate({ authorizationId: base.authorizationId, now }).reason, 'authorization_expired');

  const revoked = new AuthorizationLedger();
  revoked.register(base);
  revoked.revoke(base.authorizationId);
  assert.equal(revoked.validate({ authorizationId: base.authorizationId, now }).reason, 'authorization_revoked');

  const reused = new AuthorizationLedger();
  reused.register(base);
  reused.consume({ authorizationId: base.authorizationId, now });
  assert.equal(reused.validate({ authorizationId: base.authorizationId, now }).reason, 'authorization_reused');

  const impostor = new AuthorizationLedger();
  impostor.register({ ...base, ownerIdentityProofFake: 'not-the-real-proof' });
  assert.equal(impostor.validate({ authorizationId: base.authorizationId, now }).reason, 'owner_identity_unverified');

  const unknownId = new AuthorizationLedger();
  assert.equal(unknownId.validate({ authorizationId: 'AUTH-missing', now }).reason, 'unknown_authorization');
});

test('consume is irreversible: a second consume on the same authorization always fails', () => {
  const ledger = new AuthorizationLedger();
  ledger.register(clone(FIXTURE.authorization));
  const first = ledger.consume({ authorizationId: FIXTURE.authorization.authorizationId, now: FIXTURE.now });
  const second = ledger.consume({ authorizationId: FIXTURE.authorization.authorizationId, now: FIXTURE.now });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'authorization_reused');
});

// ---------------------------------------------------------------------------
// Admission Validator: five independent negative checks (§5 steps 3-7, §12, §13)
// ---------------------------------------------------------------------------

test('admission checks pass on the unmodified baseline scenario', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('stale base: denies on base_sha alone even though spec_sha256 still matches the spec at that old base_sha', () => {
  const { authorization, request, sources, now } = scenario();
  // The spec hash at the OLD base still matches the declared one: only the base itself is stale.
  sources.currentBaseSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: false, reasons: ['stale_base'] });
});

test('modified spec: denies on spec_sha256 alone even though the base is still current', () => {
  const { authorization, request, sources, now } = scenario();
  sources.specShaAtBase = '2222222222222222222222222222222222222222222222222222222222222222';
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: false, reasons: ['spec_modified'] });
});

test('pending decision: denies alone even though dependencies and reservation are valid', () => {
  const { authorization, request, sources, now } = scenario();
  sources.requiredDecisions = ['D-900'];
  sources.approvedDecisions = [];
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: false, reasons: ['decision_pending'] });
});

test('incomplete dependency: denies alone even though no decision is pending', () => {
  const { authorization, request, sources, now } = scenario();
  sources.dependencies = [{ id: 'LF-001a', doneProofOk: false }];
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: false, reasons: ['dependency_incomplete'] });
});

test('foreign reservation (reserva ajena): denies alone, distinct from the Lease Store\'s own operational overlap', () => {
  const { authorization, request, sources, now } = scenario();
  sources.foreignHandoffReservations = [{ taskId: 'LF-200', files: ['docs/specs/LF-099.md'] }];
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { ok: false, reasons: ['foreign_reservation_conflict'] });
});

test('unknown or expired authorization, budget shortfall, live lease overlap and excess permissions each deny independently too', () => {
  const unknownAuth = scenario();
  const stores1 = freshLedgers({ authorization: unknownAuth.authorization });
  unknownAuth.request.authorizationId = 'AUTH-missing';
  assert.deepEqual(
    evaluateAdmissionChecks({ ...stores1, sources: unknownAuth.sources, request: unknownAuth.request, now: unknownAuth.now }).reasons,
    ['unknown_authorization']
  );

  const noBudget = scenario();
  const stores2 = freshLedgers({ authorization: noBudget.authorization, hardLimitCents: null });
  assert.deepEqual(
    evaluateAdmissionChecks({ ...stores2, sources: noBudget.sources, request: noBudget.request, now: noBudget.now }).reasons,
    ['budget_not_available']
  );

  const busyLease = scenario();
  const stores3 = freshLedgers({ authorization: busyLease.authorization });
  stores3.leaseStore.acquire({ taskId: 'LF-other', scopeFiles: busyLease.request.scopeFiles });
  assert.deepEqual(
    evaluateAdmissionChecks({ ...stores3, sources: busyLease.sources, request: busyLease.request, now: busyLease.now }).reasons,
    ['lease_overlap']
  );

  const excessPerms = scenario();
  excessPerms.sources.effectivePermissions = ['admin:protection-rules'];
  excessPerms.sources.minimumRequiredPermissions = [];
  const stores4 = freshLedgers({ authorization: excessPerms.authorization });
  assert.deepEqual(
    evaluateAdmissionChecks({ ...stores4, sources: excessPerms.sources, request: excessPerms.request, now: excessPerms.now }).reasons,
    ['permissions_exceed_minimum']
  );
});

// ---------------------------------------------------------------------------
// Regression: authorization must be bound to the request, not just valid on its own
// ---------------------------------------------------------------------------

function assertDeniedWithoutSideEffects({ authorization, request, sources, now, expectedReason }) {
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { admitted: false, reasons: [expectedReason] });
  assert.equal(leaseStore.inspect(request.taskId), null);
  assert.equal(budgetLedger.inspect(request.taskId).reserved, null);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, false);
}

test('regression: an otherwise-valid authorization registered for a different task_id denies alone, with zero side effects', () => {
  const { authorization, request, sources, now } = scenario();
  authorization.taskId = 'LF-other';
  assertDeniedWithoutSideEffects({ authorization, request, sources, now, expectedReason: 'authorization_task_mismatch' });
});

test('regression: an otherwise-valid authorization registered for a different spec_sha256 denies alone, with zero side effects', () => {
  const { authorization, request, sources, now } = scenario();
  authorization.specSha256 = '3333333333333333333333333333333333333333333333333333333333333333';
  assertDeniedWithoutSideEffects({ authorization, request, sources, now, expectedReason: 'authorization_spec_mismatch' });
});

test('regression: an otherwise-valid authorization registered for different scope_files denies alone, with zero side effects', () => {
  const { authorization, request, sources, now } = scenario();
  authorization.scopeFiles = ['docs/specs/OTHER-TASK.md'];
  assertDeniedWithoutSideEffects({ authorization, request, sources, now, expectedReason: 'authorization_scope_mismatch' });
});

test('regression: an otherwise-valid authorization registered for a different base_sha denies alone, with zero side effects', () => {
  const { authorization, request, sources, now } = scenario();
  authorization.baseSha = 'cccccccccccccccccccccccccccccccccccccccc';
  assertDeniedWithoutSideEffects({ authorization, request, sources, now, expectedReason: 'authorization_base_mismatch' });
});

// ---------------------------------------------------------------------------
// Durable admission operation: compensation, confirmed rejection vs unknown_outcome
// ---------------------------------------------------------------------------

test('happy path admits exactly once: lease acquired, budget reserved, authorization irreversibly consumed', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(result.admitted, true);
  assert.equal(leaseStore.inspect(request.taskId).fenceToken, result.fenceToken);
  assert.equal(budgetLedger.inspect(request.taskId).reserved.fenceToken, result.fenceToken);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, true);
});

test('checks denial never touches any ledger: zero reservations, zero leases, zero consumption', () => {
  const { authorization, request, sources, now } = scenario();
  sources.requiredDecisions = ['D-900'];
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { admitted: false, reasons: ['decision_pending'] });
  assert.equal(leaseStore.inspect(request.taskId), null);
  assert.equal(budgetLedger.inspect(request.taskId).reserved, null);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, false);
});

test('confirmed rejection of budget reserve (a stale prior reservation for the same task): lease is released, nothing admitted', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization, hardLimitCents: 1000 });
  // A leftover reservation for this exact task_id makes the real reserve() fail even though the
  // dry-run check 8 (canReserve) would have passed, exercising the real compensation path.
  budgetLedger.reserve({ taskId: request.taskId, fenceToken: 999, estimatedCostCents: 0 });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { admitted: false, reasons: ['already_reserved'] });
  assert.equal(leaseStore.inspect(request.taskId), null);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, false);
});

test('confirmed rejection of authorization consume: budget and lease are both released, nothing admitted', () => {
  const { request, sources, now } = scenario();
  const { leaseStore, budgetLedger } = freshLedgers({});
  // Test double: `validate` passes, with an entry correctly bound to this request, so the read-only
  // checks clear, but `consume` fails for real, in isolation, exercising the orchestrator's step-3
  // compensation branch.
  const failingAuthorizationLedger = {
    validate: () => ({ ok: true, entry: { taskId: request.taskId, specSha256: request.specSha256, scopeFiles: request.scopeFiles, baseSha: request.baseSha } }),
    consume: () => ({ confirmed: true, ok: false, reason: 'authorization_revoked' }),
    inspect: () => ({ consumed: false }),
  };
  const result = admitTask({ sources, authorizationLedger: failingAuthorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { admitted: false, reasons: ['authorization_revoked'] });
  assert.equal(leaseStore.inspect(request.taskId), null);
  assert.equal(budgetLedger.inspect(request.taskId).reserved, null);
});

test('unknown_outcome after budget step: lease and budget conserved, no release by the mere passage of time', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { budgetReserve: 'lost' } });
  assert.equal(result.outcome, 'unknown_outcome');
  assert.equal(result.pendingStep, 'reserveBudget');
  // The real underlying reserve genuinely succeeded; reservations are conserved, not released.
  assert.equal(leaseStore.inspect(request.taskId).fenceToken, result.fenceToken);
  assert.equal(budgetLedger.inspect(request.taskId).reserved.fenceToken, result.fenceToken);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, false);
});

test('reconciling an unknown budget outcome that actually succeeded keeps the reservation', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const pending = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { budgetReserve: 'lost' } });
  const reconciled = reconcilePendingAdmission({ pending, leaseStore, budgetLedger, authorizationLedger });
  assert.deepEqual(reconciled, { reconciled: true, outcome: 'kept', confirmedStep: 'reserveBudget', confirmed: true });
  assert.notEqual(leaseStore.inspect(request.taskId), null);
});

test('reconciling an unknown budget outcome that actually failed releases the lease, never by elapsed time', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization, hardLimitCents: 1000 });
  budgetLedger.reserve({ taskId: request.taskId, fenceToken: 999, estimatedCostCents: 0 }); // forces the real reserve to fail
  const pending = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { budgetReserve: 'lost' } });
  assert.equal(pending.outcome, 'unknown_outcome');
  const reconciled = reconcilePendingAdmission({ pending, leaseStore, budgetLedger, authorizationLedger });
  assert.deepEqual(reconciled, { reconciled: true, outcome: 'released', confirmedStep: 'reserveBudget', confirmed: false });
  assert.equal(leaseStore.inspect(request.taskId), null);
});

test('unknown_outcome after authorization consume (response lost after a save that might have happened): everything conserved', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const result = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { authorizationConsume: 'lost' } });
  assert.equal(result.outcome, 'unknown_outcome');
  assert.equal(result.pendingStep, 'consumeAuthorization');
  assert.notEqual(leaseStore.inspect(request.taskId), null);
  assert.notEqual(budgetLedger.inspect(request.taskId).reserved, null);
  // The real consume genuinely succeeded durably; a second consume must still fail (no double execution).
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, true);
});

test('reconciling a consumed-for-real authorization keeps every reservation (admission effectively confirmed)', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const pending = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { authorizationConsume: 'lost' } });
  const reconciled = reconcilePendingAdmission({ pending, leaseStore, budgetLedger, authorizationLedger });
  assert.deepEqual(reconciled, { reconciled: true, outcome: 'kept', confirmedStep: 'consumeAuthorization', confirmed: true });
});

test('two concurrent admission requests for overlapping scope_files: at most one completes the full sequence', () => {
  const first = scenario();
  const second = scenario();
  second.request.taskId = 'LF-other';
  second.authorization.authorizationId = 'AUTH-other';
  second.authorization.taskId = 'LF-other';
  second.authorization.ownerIdentityProofFake = 'OWNER-PROOF-FAKE:AUTH-other';
  second.request.authorizationId = 'AUTH-other';

  const leaseStore = new LeaseStore();
  const budgetLedger = new BudgetLedger({ hardLimitCents: 1000 });
  const authorizationLedger = new AuthorizationLedger();
  authorizationLedger.register(first.authorization);
  authorizationLedger.register(second.authorization);

  const resultA = admitTask({ sources: first.sources, authorizationLedger, budgetLedger, leaseStore, request: first.request, now: first.now });
  const resultB = admitTask({ sources: second.sources, authorizationLedger, budgetLedger, leaseStore, request: second.request, now: second.now });
  assert.equal(resultA.admitted, true);
  assert.equal(resultB.admitted, false);
  assert.deepEqual(resultB.reasons, ['lease_overlap']);
  // The losing request never consumed the authorization it was trying to use.
  assert.equal(authorizationLedger.inspect(second.authorization.authorizationId).consumed, false);
});

test('restart of the admission process with a lease held in a known partial state never reanudates automatically', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const pending = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate: { budgetReserve: 'lost' } });
  assert.equal(pending.outcome, 'unknown_outcome');
  // Re-running admitTask from scratch is never how recovery proceeds: only reconciliation may act.
  const again = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(again, { admitted: false, reasons: ['lease_overlap'] });
});

// ---------------------------------------------------------------------------
// Provider invocation: fencing applied to the send itself
// ---------------------------------------------------------------------------

test('a delayed process whose token was invalidated by recovery sends zero times', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  let sends = 0;
  const result = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; return { ok: true }; } });
  assert.deepEqual(result, { outcome: 'denied', reason: 'fence_token_invalid', sent: false });
  assert.equal(sends, 0);
});

test('invalidation first means the competing send attempt is denied: no send, no unsafe release', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  let sends = 0;
  const result = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(result.outcome, 'denied');
  assert.equal(sends, 0);
});

test('send attempt first means the competing invalidation fails: exactly one send ever happens', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; return { ok: true }; } });
  const invalidateAfter = store.invalidate({ taskId: 'LF-100', fenceToken: lease.fenceToken });
  assert.equal(result.outcome, 'sent');
  assert.equal(sends, 1);
  assert.deepEqual(invalidateAfter, { confirmed: true, ok: false, reason: 'attempt_already_registered' });
  // A second attempt with the same token can never send again: the attempt is already registered.
  const again = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(again.outcome, 'denied');
  assert.equal(sends, 1);
});

test('response lost after the send attempt was already registered: unknown_outcome, never a second send', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({
    leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken,
    send: () => { sends++; return { ok: true }; }, responseLost: true,
  });
  assert.deepEqual(result, { outcome: 'unknown_outcome', sent: 'unknown' });
  assert.equal(sends, 1);
  const retry = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(retry.outcome, 'denied');
  assert.equal(sends, 1);
});

test('send() throwing after the attempt was registered is unknown_outcome, never a thrown error, never a second send', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({
    leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken,
    send: () => { sends++; throw new Error('simulated provider failure with a sensitive detail'); },
  });
  assert.deepEqual(result, { outcome: 'unknown_outcome', sent: 'unknown' });
  assert.equal(sends, 1);
  assert.equal(JSON.stringify(result).includes('sensitive'), false, 'the real error is never exposed');
  const retry = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(retry.outcome, 'denied');
  assert.equal(sends, 1);
});

test('send() throwing while responseLost is also true stays unknown_outcome, never a thrown error', () => {
  const { leaseStore: store, budgetLedger, lease } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({
    leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, responseLost: true,
    send: () => { sends++; throw new Error('simulated timeout'); },
  });
  assert.deepEqual(result, { outcome: 'unknown_outcome', sent: 'unknown' });
  assert.equal(sends, 1);
  const retry = invokeProvider({ leaseStore: store, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(retry.outcome, 'denied');
  assert.equal(sends, 1);
});

// ---------------------------------------------------------------------------
// Regression: an uncertain send must automatically block the budget — never a
// separate step the caller might forget (reproduces the exact scenario: admit
// with a 100-cent reservation -> send() throws -> unknown_outcome -> the old
// code let the budget be released and the same 100 cents reserved again).
// ---------------------------------------------------------------------------

function assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken, result }) {
  assert.equal(result.outcome, 'unknown_outcome');
  assert.equal(JSON.stringify(result).toLowerCase().includes('sensitive'), false, 'the real error is never exposed');
  // The reservation cannot be released, and its saldo cannot be reused: cost_unreconciled, not ok.
  assert.deepEqual(budgetLedger.release({ taskId, fenceToken }), { confirmed: true, ok: false, reason: 'cost_unreconciled' });
  // No new reservation is admitted anywhere while this one cost stays unknown.
  assert.equal(budgetLedger.canReserve(1), false);
  assert.deepEqual(budgetLedger.reserve({ taskId: 'LF-other-task', fenceToken: 999, estimatedCostCents: 1 }), { confirmed: true, ok: false, reason: 'budget_not_available' });
  // The lease stays blocked too: invalidate and release both still refuse.
  assert.deepEqual(leaseStore.invalidate({ taskId, fenceToken }), { confirmed: true, ok: false, reason: 'attempt_already_registered' });
}

test('regression: exact reproduction — reserve 100, send() throws, unknown_outcome must automatically block the 100, not just mark it', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
    send: () => { sends++; throw new Error('simulated provider failure with a sensitive detail'); },
  });
  assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
  // An explicit, synthetic reconciliation afterward still correctly finalizes the confirmed consumption.
  const reconciled = budgetLedger.recordObservedCost({ taskId, fenceToken: lease.fenceToken, costCentsOrUnknown: 60 });
  assert.deepEqual(reconciled, { confirmed: true, ok: true, unknown: false, consumedCents: 60 });
  assert.equal(budgetLedger.inspect(taskId).totalConsumedCents, 60);
  assert.equal(budgetLedger.canReserve(40), true);
  assert.equal(budgetLedger.canReserve(41), false);
});

test('regression: exact reproduction — reserve 100, responseLost, unknown_outcome must automatically block the 100', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, responseLost: true,
    send: () => { sends++; return { ok: true }; },
  });
  assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
  // An explicit, synthetic reconciliation afterward still correctly finalizes the confirmed consumption.
  const reconciled = budgetLedger.recordObservedCost({ taskId, fenceToken: lease.fenceToken, costCentsOrUnknown: 100 });
  assert.deepEqual(reconciled, { confirmed: true, ok: true, unknown: false, consumedCents: 100 });
  assert.equal(budgetLedger.inspect(taskId).totalConsumedCents, 100);
  assert.equal(budgetLedger.canReserve(1), false);
});

// ---------------------------------------------------------------------------
// Regression: an asynchronous result from `send` (unsupported) must never be
// declared a success, must never crash on an eventual rejection, and must
// block lease and budget exactly like any other unknown_outcome.
// ---------------------------------------------------------------------------

test('regression: send() returning a resolved promise is never declared sent; lease and budget stay blocked', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on('unhandledRejection', onUnhandled);
  try {
    const result = invokeProvider({
      leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
      send: () => { sends++; return Promise.resolve({ ok: true }); },
    });
    assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
    await flushAsync();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(unhandled, false);
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

test('regression: send() returning a rejected promise is never declared sent, and its rejection never becomes an unhandled rejection', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on('unhandledRejection', onUnhandled);
  try {
    const result = invokeProvider({
      leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
      send: () => { sends++; return Promise.reject(new Error('simulated async failure with a sensitive detail')); },
    });
    assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
    await flushAsync();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(unhandled, false, 'the eventual rejection must never surface as an unhandled rejection');
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

test('regression: send() returning an incompatible thenable (not a real Promise) is still never declared sent', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const weirdThenable = { then: (resolve) => { resolve('x'); } };
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
    send: () => { sends++; return weirdThenable; },
  });
  assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
  await flushAsync();
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

// ---------------------------------------------------------------------------
// Regression: responseLost must unify result/error handling with the normal
// path. The old code called send() inside responseLost and discarded its
// return value entirely, so a rejected promise returned there was never
// given a handler and became an unhandled rejection.
// ---------------------------------------------------------------------------

test('regression: exact reproduction — responseLost combined with a rejected promise must not produce an unhandled rejection', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on('unhandledRejection', onUnhandled);
  try {
    const result = invokeProvider({
      leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, responseLost: true,
      send: () => { sends++; return Promise.reject(new Error('simulated async failure with a sensitive detail')); },
    });
    assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
    await flushAsync();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(unhandled, false, 'the eventual rejection must never surface as an unhandled rejection even with responseLost');
  assert.equal(sends, 1, 'send() is called exactly once, never again to inspect its result');
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

test('regression: responseLost combined with a resolved promise is handled the same way as the normal path', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on('unhandledRejection', onUnhandled);
  try {
    const result = invokeProvider({
      leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, responseLost: true,
      send: () => { sends++; return Promise.resolve({ ok: true }); },
    });
    assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
    await flushAsync();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(unhandled, false);
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

test('regression: responseLost combined with an incompatible thenable is still handled uniformly', async () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const weirdThenable = { then: (resolve) => { resolve('x'); } };
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, responseLost: true,
    send: () => { sends++; return weirdThenable; },
  });
  assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
  await flushAsync();
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

test('regression: responseLost combined with a synchronous exception stays consistent with the unified handling', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, responseLost: true,
    send: () => { sends++; throw new Error('simulated timeout with a sensitive detail'); },
  });
  assertBudgetAutomaticallyBlocked({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, result });
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1, 'no second send');
});

// ---------------------------------------------------------------------------
// Regression: the budget precondition (a valid ledger with a pending
// reservation bound to this exact task_id/fenceToken) must be checked before
// the Lease Store is touched or send() is called at all — never discovered
// to be missing only after the fact.
// ---------------------------------------------------------------------------

test('regression: a missing or invalid budgetLedger denies before touching the lease or calling send()', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget();
  let sends = 0;
  for (const badLedger of [undefined, null, {}, { inspect: 'not-a-function' }, { inspect: () => { throw new Error('boom'); } }]) {
    const result = invokeProvider({ leaseStore, budgetLedger: badLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
    assert.deepEqual(result, { outcome: 'denied', reason: 'budget_precondition_failed', sent: false });
  }
  assert.equal(sends, 0, 'zero sends while the precondition is rejected');
  assert.equal(leaseStore.inspect(taskId).attemptRegistered, false, 'the attempt was never registered');
  // The real, valid ledger still works normally afterward: nothing was corrupted by the rejections.
  const real = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; return { ok: true }; } });
  assert.equal(real.outcome, 'sent');
  assert.equal(sends, 1);
});

test('regression: no pending reservation at all for this task denies before touching the lease or calling send()', () => {
  const leaseStore = new LeaseStore();
  const budgetLedger = new BudgetLedger({ hardLimitCents: 100 }); // nothing reserved for any task
  const lease = leaseStore.acquire({ taskId: 'LF-100', scopeFiles: ['docs/specs/LF-100.md'] });
  let sends = 0;
  const result = invokeProvider({ leaseStore, budgetLedger, taskId: 'LF-100', fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.deepEqual(result, { outcome: 'denied', reason: 'budget_precondition_failed', sent: false });
  assert.equal(sends, 0);
  assert.equal(leaseStore.inspect('LF-100').attemptRegistered, false);
});

test('regression: a reservation bound to a different fencing token denies before touching the lease or calling send()', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken + 1000, send: () => { sends++; } });
  assert.deepEqual(result, { outcome: 'denied', reason: 'budget_precondition_failed', sent: false });
  assert.equal(sends, 0);
  assert.equal(leaseStore.inspect(taskId).attemptRegistered, false);
});

test('regression: a reservation already finalized with a real observed cost denies before touching the lease or calling send()', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  const finalized = budgetLedger.recordObservedCost({ taskId, fenceToken: lease.fenceToken, costCentsOrUnknown: 100 });
  assert.equal(finalized.ok, true);
  let sends = 0;
  const result = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.deepEqual(result, { outcome: 'denied', reason: 'budget_precondition_failed', sent: false });
  assert.equal(sends, 0);
  assert.equal(leaseStore.inspect(taskId).attemptRegistered, false);
});

test('regression: an unexpected failure blocking the budget after send() is a distinct, conservative outcome — never the confirmed unknown_outcome', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget({ hardLimitCents: 100, estimatedCostCents: 100 });
  let sends = 0;
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
    send: () => {
      sends++;
      // Simulates something external finalizing the reservation with a real number during the send
      // window, so the automatic block attempted afterward finds nothing left to reconcile.
      budgetLedger.recordObservedCost({ taskId, fenceToken: lease.fenceToken, costCentsOrUnknown: 100 });
      throw new Error('simulated provider failure with a sensitive detail');
    },
  });
  assert.deepEqual(result, { outcome: 'unknown_outcome_budget_unconfirmed', sent: 'unknown' });
  assert.equal(JSON.stringify(result).toLowerCase().includes('sensitive'), false, 'the real error is never exposed');
  assert.equal(sends, 1);
  // The lease stays blocked regardless of whether the budget block itself could be confirmed.
  assert.deepEqual(leaseStore.invalidate({ taskId, fenceToken: lease.fenceToken }), { confirmed: true, ok: false, reason: 'attempt_already_registered' });
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken, send: () => { sends++; } });
  assert.deepEqual(secondAttempt, { outcome: 'denied', reason: 'budget_precondition_failed', sent: false });
  assert.equal(sends, 1, 'no second send');
});

test('a plain synchronous object result (not thenable) is still declared sent normally', () => {
  const { leaseStore, budgetLedger, lease, taskId } = acquireLeaseAndBudget();
  let sends = 0;
  const result = invokeProvider({
    leaseStore, budgetLedger, taskId, fenceToken: lease.fenceToken,
    send: () => { sends++; return { mode: 'simulation-only', then: 'not-a-function' }; },
  });
  assert.equal(result.outcome, 'sent');
  assert.equal(sends, 1);
});

test('end to end: admission through a single simulated invocation, never a second one for the same token', () => {
  const { authorization, request, sources, now } = scenario();
  const { leaseStore, budgetLedger, authorizationLedger } = freshLedgers({ authorization });
  const admission = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(admission.admitted, true);
  let sends = 0;
  const invocation = invokeProvider({
    leaseStore, budgetLedger, taskId: admission.taskId, fenceToken: admission.fenceToken,
    send: () => { sends++; return { mode: 'simulation-only' }; },
  });
  assert.equal(invocation.outcome, 'sent');
  assert.equal(sends, 1);
  const secondAttempt = invokeProvider({ leaseStore, budgetLedger, taskId: admission.taskId, fenceToken: admission.fenceToken, send: () => { sends++; } });
  assert.equal(secondAttempt.outcome, 'denied');
  assert.equal(sends, 1);
});
